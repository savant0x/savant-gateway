import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  AuthenticatedKey,
  FreePoolReservation,
  GatewayModel,
} from "../../projections.ts";

import { randomUUID } from "node:crypto";

import { accountDailyAllowance } from "../../allocation.ts";
import {
  decideFreeAdmission,
  estimateWeightedTokens,
  type FreeAdmissionBlocked,
  type FreePoolConfig,
  readFreePoolConfig,
} from "../../free-pool.ts";
import { quotaIsCurrent } from "../../provider-quota.ts";
import { readTrialConfig } from "../../trials.ts";
import { quarantineHold, quarantinedWeight } from "../ledger/settlements.ts";
import { reserveTrial, settleTrial } from "../ledger/trials.ts";

import { ensureDailyAllocation, getAllocationConfig } from "./allocations.ts";
import { HOLD_TTL_MS } from "./credit.ts";
import { getProviderStatusBySlug } from "./providers.ts";
import { getSetting, saveSetting } from "./settings.ts";

/**
 * Free-pool admission and settlement, ported to the async handle (FID-086,
 * Batch B).
 *
 * This is the only path where a call is admitted without credit or a
 * subscription, so its two properties are the whole safety argument:
 *
 * 1. **The decision and the reservation share one transaction.** Two concurrent
 *    requests cannot both take the last slice of a day's allowance, because the
 *    second one reads the first one's committed reservation.
 * 2. **An elapsed reservation becomes quarantine, not a refund.** Its capacity
 *    stays reserved (`quarantinedWeight` is added to the in-flight total),
 *    because a timeout is not evidence that the upstream did nothing.
 *
 * The SQLite version composed these from synchronous helpers. Here the trial
 * ledger, the quarantine ledger and the allocation ledger are all async, so the
 * whole transaction is one awaited block — and `settleFreeReservation` must run
 * inside the caller's usage-settlement transaction, exactly as before.
 */

const ALERT_INTERVAL_MS = 60 * 60 * 1000;

function alertKey(slug: string) {
  return `free_pool.provider_alerted_at.${slug}`;
}

export type FreeAdmissionResult =
  | { ok: true; reservation: FreePoolReservation }
  | { ok: false; blocked: FreeAdmissionBlocked };

export function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

async function usedWeighted(db: PostgresDatabase, userId: string, day: string) {
  const row = await db
    .prepare(
      "SELECT weighted_tokens FROM free_pool_usage WHERE user_id = ? AND day = ?",
    )
    .get<{ weighted_tokens: number | string }>(userId, day);

  return Math.max(0, Number(row?.weighted_tokens ?? 0));
}

async function reservedWeighted(
  db: PostgresDatabase,
  userId: string,
  at: string,
) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(weighted_tokens), 0) AS total
         FROM free_pool_reservations
        WHERE user_id = ? AND expires_at > ?`,
    )
    .get<{ total: number | string }>(userId, at);

  // An unresolved admission still owes its estimate; releasing it on a timer
  // would hand back capacity for a call that may have been served.
  return Math.max(
    0,
    Number(row?.total ?? 0) + (await quarantinedWeight(db, userId, "free")),
  );
}

async function maybeAlert(
  db: PostgresDatabase,
  remaining: number | null,
  config: FreePoolConfig,
  providerSlug: string,
) {
  if (remaining === null || remaining > config.providerAlertThreshold) return;

  const now = Date.now();
  const last = Number((await getSetting(db, alertKey(providerSlug))) ?? 0);

  if (Number.isFinite(last) && now - last < ALERT_INTERVAL_MS) return;

  await saveSetting(db, alertKey(providerSlug), String(now));
  // eslint-disable-next-line no-console
  console.warn(
    `[free-pool] ${providerSlug} remaining is ${remaining} weighted tokens, at or below the ${config.providerAlertThreshold} alert threshold.`,
  );
}

/**
 * Reserves weighted free-pool tokens before dispatch. The decision and the
 * reservation insert run in one transaction, so concurrent requests cannot both
 * take the last slice of a user's daily allowance.
 */
export async function reserveFreeCall(
  db: PostgresDatabase,
  input: {
    auth: AuthenticatedKey;
    model: GatewayModel;
    promptTokens: number;
    outputBudget: number;
    now?: number;
  },
): Promise<FreeAdmissionResult> {
  const nowMs = input.now ?? Date.now();
  const at = new Date(nowMs).toISOString();
  const day = utcDay(nowMs);
  const config = readFreePoolConfig();
  const reservationId = `free_${randomUUID()}`;
  const expiresAt = new Date(nowMs + HOLD_TTL_MS).toISOString();

  const outcome = await db
    .transaction(async () => {
      const expired = await db
        .prepare(
          `SELECT id, user_id, api_key_id, model_id, weighted_tokens,
                  created_at, expires_at
             FROM free_pool_reservations WHERE expires_at <= ?`,
        )
        .all<{
          id: string;
          user_id: string;
          api_key_id: string | null;
          model_id: string | null;
          weighted_tokens: number | string;
          created_at: string;
          expires_at: string;
        }>(at);

      for (const reservation of expired) {
        await quarantineHold(db, {
          id: reservation.id,
          kind: "free",
          userId: reservation.user_id,
          keyId: reservation.api_key_id,
          modelId: reservation.model_id,
          reserved: Number(reservation.weighted_tokens),
          createdAt: reservation.created_at,
          expiredAt: reservation.expires_at,
        });
        await db
          .prepare("DELETE FROM free_pool_reservations WHERE id = ?")
          .run(reservation.id);
      }

      const status = await getProviderStatusBySlug(
        db,
        input.model.upstreamSlug,
      );
      const current = quotaIsCurrent(status, nowMs);
      const remaining = current ? status.admissionRemainingTokens : null;
      const trial = readTrialConfig();
      const estimate = estimateWeightedTokens(
        input.promptTokens,
        input.outputBudget,
        input.model.tokenWeight,
      );

      if (
        trial.enabled &&
        (!current ||
          (!status.quota.unlimited &&
            (remaining === null ||
              remaining - estimate < config.providerRemainingFloor)))
      ) {
        return {
          decision: {
            allowed: false as const,
            reason: "provider_pool" as const,
            status: 429 as const,
            type: "insufficient_quota" as const,
            message:
              "Trial capacity is temporarily unavailable. Try again later.",
            retryAfterSeconds: 300,
            resetAt: null,
          },
          alert: null,
        };
      }

      // The daily allowance is the account's share of the shared pool when
      // allocation is enabled, and the fixed per-user fallback otherwise. In
      // both modes the per-account daily cap applies, so one identity cannot
      // take a multi-million share merely because few accounts exist yet.
      // Trial mode keeps its own durable ledger and ignores all of this.
      const providerGate = decideFreeAdmission({
        config: { ...config, dailyWeightedTokens: Number.MAX_SAFE_INTEGER },
        promptTokens: input.promptTokens,
        outputBudget: input.outputBudget,
        tokenWeight: input.model.tokenWeight,
        usedWeightedTokens: 0,
        reservedWeightedTokens: 0,
        providerRemaining: remaining,
        providerAllowed: current ? status.subscriptionAllowed : null,
        providerUnlimited: current && status.quota.unlimited,
        now: nowMs,
      });

      if (!providerGate.allowed) return { decision: providerGate, alert: null };

      const allocation = await getAllocationConfig(db);
      const shareTokens =
        !trial.enabled && allocation.enabled
          ? await ensureDailyAllocation(
              db,
              input.auth.userId,
              day,
              input.model.upstreamSlug,
            )
          : config.dailyWeightedTokens;
      const dailyAllowance = trial.enabled
        ? Number.MAX_SAFE_INTEGER
        : accountDailyAllowance(allocation, shareTokens);
      // True when the cap, not the account's share, is the binding limit, so a
      // refusal can name the limit the caller actually hit.
      const capBinds =
        !trial.enabled &&
        allocation.accountDailyCapTokens > 0 &&
        dailyAllowance < shareTokens;
      const next = decideFreeAdmission({
        config: { ...config, dailyWeightedTokens: dailyAllowance },
        promptTokens: input.promptTokens,
        outputBudget: input.outputBudget,
        tokenWeight: input.model.tokenWeight,
        usedWeightedTokens: trial.enabled
          ? 0
          : await usedWeighted(db, input.auth.userId, day),
        reservedWeightedTokens: trial.enabled
          ? 0
          : await reservedWeighted(db, input.auth.userId, at),
        providerRemaining: remaining,
        providerAllowed: current ? status.subscriptionAllowed : null,
        providerUnlimited: current && status.quota.unlimited,
        now: nowMs,
      });

      if (!next.allowed) {
        return {
          decision:
            next.reason === "user_allowance" && capBinds
              ? {
                  ...next,
                  message: `Daily trial-credit cap reached (${dailyAllowance.toLocaleString("en-US")} weighted tokens). Resets at ${next.resetAt}.`,
                }
              : next,
          alert: null,
        };
      }

      if (
        trial.enabled &&
        !(await reserveTrial(db, {
          userId: input.auth.userId,
          id: reservationId,
          estimated: estimate,
          now: at,
          expiresAt,
          config: trial,
        }))
      ) {
        return {
          decision: {
            allowed: false as const,
            reason: "trial_exhausted" as const,
            status: 402 as const,
            type: "insufficient_quota" as const,
            message:
              "Trial allowance unavailable or insufficient. Add prepaid credit to continue.",
            retryAfterSeconds: 0,
            resetAt: null,
          },
          alert: null,
        };
      }

      const alert =
        next.alert && remaining !== null ? { remaining, config } : null;

      await db
        .prepare(
          `INSERT INTO free_pool_reservations
            (id, user_id, api_key_id, model_id, provider_slug, day,
             weighted_tokens, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          reservationId,
          input.auth.userId,
          input.auth.keyId,
          input.model.id,
          input.model.upstreamSlug,
          day,
          next.estimatedWeightedTokens,
          at,
          expiresAt,
        );

      return { decision: next, alert };
    })
    .immediate();

  if (!outcome.decision.allowed) {
    return { ok: false, blocked: outcome.decision };
  }

  if (outcome.alert) {
    await maybeAlert(
      db,
      outcome.alert.remaining,
      outcome.alert.config,
      input.model.upstreamSlug,
    );
  }

  return {
    ok: true,
    reservation: {
      id: reservationId,
      day,
      weightedTokens: outcome.decision.estimatedWeightedTokens,
    },
  };
}

/**
 * Releases the reservation and adds the actual weighted usage. Call inside the
 * usage-settlement transaction so a usage row and its free-pool debit agree.
 */
export async function settleFreeReservation(
  db: PostgresDatabase,
  input: {
    reservation: FreePoolReservation;
    userId: string;
    weightedTokens: number;
    settledAt?: string;
  },
) {
  await db
    .prepare("DELETE FROM free_pool_reservations WHERE id = ? AND user_id = ?")
    .run(input.reservation.id, input.userId);

  const weighted = Math.max(0, Math.floor(input.weightedTokens));
  const settledAt = input.settledAt ?? new Date().toISOString();

  await settleTrial(db, {
    id: input.reservation.id,
    userId: input.userId,
    actual: weighted,
    now: settledAt,
  });

  if (weighted === 0) return;

  await db
    .prepare(
      `INSERT INTO free_pool_usage (user_id, day, weighted_tokens, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, day) DO UPDATE SET
         weighted_tokens = free_pool_usage.weighted_tokens + excluded.weighted_tokens,
         updated_at = excluded.updated_at`,
    )
    .run(input.userId, input.reservation.day, weighted, settledAt);
}
