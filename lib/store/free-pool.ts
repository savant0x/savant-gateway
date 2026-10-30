import "server-only";

import type {
  AuthenticatedKey,
  FreePoolReservation,
  GatewayModel,
} from "./shared";

import { randomUUID } from "node:crypto";

import { accountDailyAllowance } from "../allocation";
import { db, nowIso } from "../db";
import {
  decideFreeAdmission,
  estimateWeightedTokens,
  type FreeAdmissionBlocked,
  type FreePoolConfig,
  readFreePoolConfig,
} from "../free-pool";
import { reserveTrial, settleTrial } from "../trial-ledger";
import { readTrialConfig } from "../trials";
import { quotaIsCurrent } from "../provider-quota";
import { quarantineHold, quarantinedWeight } from "../settlement-ledger";

import { ensureDailyAllocation, getAllocationConfig } from "./allocations";
import { HOLD_TTL_MS } from "./billing";
import { getProviderStatusBySlug } from "./providers";
import { getSetting, saveSetting } from "./settings";

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

function usedWeighted(userId: string, day: string) {
  const row = db
    .prepare(
      "SELECT weighted_tokens FROM free_pool_usage WHERE user_id = ? AND day = ?",
    )
    .get(userId, day) as { weighted_tokens: number } | undefined;

  return Math.max(0, row?.weighted_tokens ?? 0);
}

function reservedWeighted(userId: string, at: string) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(weighted_tokens), 0) AS total
       FROM free_pool_reservations
       WHERE user_id = ? AND expires_at > ?`,
    )
    .get(userId, at) as { total: number };

  // An unresolved admission still owes its estimate; releasing it on a timer
  // would hand back capacity for a call that may have been served.
  return Math.max(0, row.total + quarantinedWeight(db, userId, "free"));
}

function maybeAlert(
  remaining: number | null,
  config: FreePoolConfig,
  providerSlug: string,
) {
  if (remaining === null || remaining > config.providerAlertThreshold) return;

  const now = Date.now();
  const last = Number(getSetting(alertKey(providerSlug)) ?? 0);

  if (Number.isFinite(last) && now - last < ALERT_INTERVAL_MS) return;

  saveSetting(alertKey(providerSlug), String(now));
  // eslint-disable-next-line no-console
  console.warn(
    `[free-pool] ${providerSlug} remaining is ${remaining} weighted tokens, at or below the ${config.providerAlertThreshold} alert threshold.`,
  );
}

/**
 * Reserves weighted free-pool tokens before dispatch. The decision and the
 * reservation insert run in one immediate transaction so concurrent requests
 * cannot both take the last slice of a user's daily allowance.
 */
export function reserveFreeCall(input: {
  auth: AuthenticatedKey;
  model: GatewayModel;
  promptTokens: number;
  outputBudget: number;
  now?: number;
}): FreeAdmissionResult {
  const nowMs = input.now ?? Date.now();
  const at = new Date(nowMs).toISOString();
  const day = utcDay(nowMs);
  const config = readFreePoolConfig();
  const reservationId = `free_${randomUUID()}`;

  const outcome = db
    .transaction(() => {
      const expired = db
        .prepare(
          `SELECT id, user_id, api_key_id, model_id, weighted_tokens,
                  created_at, expires_at
           FROM free_pool_reservations WHERE expires_at <= ?`,
        )
        .all(at) as Array<{
        id: string;
        user_id: string;
        api_key_id: string | null;
        model_id: string | null;
        weighted_tokens: number;
        created_at: string;
        expires_at: string;
      }>;

      for (const reservation of expired) {
        quarantineHold(db, {
          id: reservation.id,
          kind: "free",
          userId: reservation.user_id,
          keyId: reservation.api_key_id,
          modelId: reservation.model_id,
          reserved: reservation.weighted_tokens,
          createdAt: reservation.created_at,
          expiredAt: reservation.expires_at,
        });
        db.prepare("DELETE FROM free_pool_reservations WHERE id = ?").run(
          reservation.id,
        );
      }

      const status = getProviderStatusBySlug(input.model.upstreamSlug);
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

      const allocation = getAllocationConfig();
      const shareTokens =
        !trial.enabled && allocation.enabled
          ? ensureDailyAllocation(
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
          : usedWeighted(input.auth.userId, day),
        reservedWeightedTokens: trial.enabled
          ? 0
          : reservedWeighted(input.auth.userId, at),
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
        !reserveTrial(db, {
          userId: input.auth.userId,
          id: reservationId,
          estimated: estimate,
          now: at,
          expiresAt: new Date(nowMs + HOLD_TTL_MS).toISOString(),
          config: trial,
        })
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

      db.prepare(
        `INSERT INTO free_pool_reservations
        (id, user_id, api_key_id, model_id, provider_slug, day,
         weighted_tokens, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        reservationId,
        input.auth.userId,
        input.auth.keyId,
        input.model.id,
        input.model.upstreamSlug,
        day,
        next.estimatedWeightedTokens,
        at,
        new Date(nowMs + HOLD_TTL_MS).toISOString(),
      );

      return { decision: next, alert };
    })
    .immediate();

  if (!outcome.decision.allowed) {
    return { ok: false, blocked: outcome.decision };
  }

  if (outcome.alert) {
    maybeAlert(
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
export function settleFreeReservation(input: {
  reservation: FreePoolReservation;
  userId: string;
  weightedTokens: number;
  settledAt?: string;
}) {
  db.prepare(
    "DELETE FROM free_pool_reservations WHERE id = ? AND user_id = ?",
  ).run(input.reservation.id, input.userId);

  const weighted = Math.max(0, Math.floor(input.weightedTokens));

  settleTrial(db, {
    id: input.reservation.id,
    userId: input.userId,
    actual: weighted,
    now: input.settledAt ?? nowIso(),
  });

  if (weighted === 0) return;

  db.prepare(
    `INSERT INTO free_pool_usage (user_id, day, weighted_tokens, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, day) DO UPDATE SET
       weighted_tokens = weighted_tokens + excluded.weighted_tokens,
       updated_at = excluded.updated_at`,
  ).run(
    input.userId,
    input.reservation.day,
    weighted,
    input.settledAt ?? nowIso(),
  );
}
