import type { PostgresDatabase } from "../pg-adapter.ts";

import { randomUUID } from "node:crypto";

import { decideAllowance } from "../../plans.ts";

import {
  activeSubscriptionRow,
  openPeriodRow,
  type PeriodRow,
} from "./subscription-rows.ts";
import {
  lockOpenPeriod,
  lockPeriod,
  lockSubscription,
  lockSubscriptionHold,
  lockUser,
} from "./subscription-locks.ts";
import { sweepSubscriptions } from "./subscription-sweep.ts";

/**
 * Subscription admission, ported to the async handle (FID-085 step 4).
 *
 * This is the only place that decides whether a call is billed to a
 * subscription, and the ordering is the rule: past-due blocks before free or
 * credit routing, so a failed payment cannot keep serving. A model the
 * subscription does not cover returns `none`, which lets the caller fall through
 * to free or credit billing rather than answering a confusing refusal.
 *
 * Two mechanics are unchanged and load-bearing:
 *
 * 1. Admission takes a hold and increments `weighted_tokens_held` in one
 *    transaction, then settlement moves that hold into `weighted_tokens_used`.
 *    The allowance is therefore never exceeded by concurrent requests that were
 *    admitted together.
 * 2. An expired hold is **quarantined**, not silently returned. An elapsed TTL is
 *    not evidence that no upstream work happened, so only an audited operator
 *    release frees the allowance.
 *
 * `GREATEST(0, ...)` replaces the SQLite habit of `MAX(0, ...)`: in PostgreSQL
 * `MAX` is an aggregate, and using it as a scalar would change the shape of the
 * statement rather than its arithmetic.
 */

export type SubscriptionAccess =
  | { kind: "none" }
  | {
      kind: "blocked";
      status: 402 | 503;
      code: string;
      message: string;
    }
  | {
      kind: "included";
      subscriptionId: string;
      periodId: string;
      holdId: string;
      weightedTokens: number;
      markupBps: 0;
    }
  | {
      kind: "overage";
      subscriptionId: string;
      periodId: string;
      markupBps: number;
    };

const HOLD_TTL_MS = 15 * 60 * 1000;

async function coveredByPlan(
  db: PostgresDatabase,
  subscriptionId: string,
  modelId: string,
) {
  return Boolean(
    await db
      .prepare(
        `SELECT 1 FROM subscription_models
          WHERE subscription_id = ? AND model_id = ? LIMIT 1`,
      )
      .get(subscriptionId, modelId),
  );
}

function blocked(code: string, message: string, status: 402 | 503 = 402) {
  return { kind: "blocked" as const, status, code, message };
}

/**
 * Resolves one call to a single billing source. Past-due subscriptions block
 * before free or credit routing so a failed payment cannot keep serving.
 */
export async function resolveSubscriptionAccess(
  db: PostgresDatabase,
  input: {
    userId: string;
    keyId: string;
    modelId: string;
    estimateWeightedTokens: number;
    now?: number;
  },
): Promise<SubscriptionAccess> {
  const now = input.now ?? Date.now();

  await sweepSubscriptions(db, now);

  const subscription = await activeSubscriptionRow(db, input.userId);

  if (!subscription) return { kind: "none" };

  if (subscription.status === "past_due") {
    return blocked(
      "subscription_past_due",
      "This subscription is past due. Update payment in the billing portal.",
    );
  }

  if (!(await coveredByPlan(db, subscription.id, input.modelId))) {
    return { kind: "none" };
  }

  const estimate = Math.max(1, Math.ceil(input.estimateWeightedTokens));
  const holdId = `subhold_${randomUUID()}`;
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + HOLD_TTL_MS).toISOString();

  return db
    .transaction(async () => {
      if (!(await lockUser(db, input.userId))) return { kind: "none" as const };

      const lockedSubscription = await lockSubscription(db, subscription.id);

      if (!lockedSubscription) return { kind: "none" as const };

      if (lockedSubscription.status === "past_due") {
        return blocked(
          "subscription_past_due",
          "This subscription is past due. Update payment in the billing portal.",
        );
      }

      if (lockedSubscription.status !== "active") {
        return { kind: "none" as const };
      }

      if (!(await coveredByPlan(db, lockedSubscription.id, input.modelId))) {
        return { kind: "none" as const };
      }

      const period = await lockOpenPeriod(db, lockedSubscription.id);

      if (!period) {
        return blocked(
          "subscription_period_missing",
          "This subscription has no open allowance period. Contact the operator.",
          503,
        );
      }

      const next = decideAllowance({
        includedWeightedTokens: Number(period.included_weighted_tokens),
        usedWeightedTokens: Number(period.weighted_tokens_used),
        heldWeightedTokens: Number(period.weighted_tokens_held),
        estimateWeightedTokens: estimate,
        overageMode: lockedSubscription.overage_mode_snapshot,
      });

      if (next.kind === "block") {
        return blocked(
          "subscription_limit_reached",
          "The included allowance for this period is exhausted.",
        );
      }

      if (next.kind === "credit") {
        return {
          kind: "overage" as const,
          subscriptionId: lockedSubscription.id,
          periodId: period.id,
          markupBps: Number(lockedSubscription.overage_markup_bps_snapshot),
        };
      }

      const updated = await db
        .prepare(
          `UPDATE subscription_periods
              SET weighted_tokens_held = weighted_tokens_held + ?
            WHERE id = ? AND status = 'open'
            RETURNING id`,
        )
        .all<{ id: string }>(estimate, period.id);

      if (updated.length === 0) {
        return blocked(
          "subscription_period_missing",
          "This subscription has no open allowance period. Contact the operator.",
          503,
        );
      }

      await db
        .prepare(
          `INSERT INTO subscription_holds
            (id, subscription_id, period_id, user_id, api_key_id, model_id,
             weighted_tokens, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          holdId,
          lockedSubscription.id,
          period.id,
          input.userId,
          input.keyId,
          input.modelId,
          estimate,
          createdAt,
          expiresAt,
        );

      return {
        kind: "included" as const,
        subscriptionId: lockedSubscription.id,
        periodId: period.id,
        holdId,
        weightedTokens: estimate,
        markupBps: 0 as const,
      };
    })
    .immediate();
}

/** Runs inside recordUsage's transaction so usage and allowance settle atomically. */
export async function settleSubscriptionHoldWithin(
  db: PostgresDatabase,
  holdId: string,
  actualWeightedTokens: number,
) {
  const seed = await db
    .prepare(
      `SELECT id, subscription_id, period_id, user_id
         FROM subscription_holds WHERE id = ?`,
    )
    .get<{
      id: string;
      subscription_id: string;
      period_id: string;
      user_id: string;
    }>(holdId);

  if (!seed) return 0;

  // recordUsage's transaction already holds the settlement and user locks in
  // the shared order. Re-taking the user lock is a no-op when held and makes
  // this helper safe when a caller settles a hold directly.
  if (!(await lockUser(db, seed.user_id))) return 0;
  if (!(await lockSubscription(db, seed.subscription_id))) return 0;
  if (!(await lockPeriod(db, seed.period_id))) return 0;

  const hold = await lockSubscriptionHold(db, holdId);

  if (!hold) return 0;

  await db.prepare("DELETE FROM subscription_holds WHERE id = ?").run(holdId);
  await db
    .prepare(
      `UPDATE subscription_periods
          SET weighted_tokens_held = GREATEST(0, weighted_tokens_held - ?),
              weighted_tokens_used = weighted_tokens_used + ?
        WHERE id = ?`,
    )
    .run(
      Number(hold.weighted_tokens),
      Math.max(0, Math.floor(actualWeightedTokens)),
      hold.period_id,
    );

  return hold.period_id;
}

export async function openSubscriptionPeriod(
  db: PostgresDatabase,
  input: {
    subscriptionId: string;
    start: string;
    end: string;
    includedWeightedTokens: number;
  },
  now = new Date().toISOString(),
): Promise<PeriodRow | undefined> {
  const id = `period_${randomUUID()}`;

  if (!(await lockSubscription(db, input.subscriptionId))) return undefined;

  const current = await lockOpenPeriod(db, input.subscriptionId);

  if (current) {
    await db
      .prepare(
        `UPDATE subscription_periods SET status = 'closed'
          WHERE id = ? AND status = 'open'`,
      )
      .run(current.id);
  }

  await db
    .prepare(
      `INSERT INTO subscription_periods
        (id, subscription_id, period_start, period_end,
         included_weighted_tokens, weighted_tokens_used, weighted_tokens_held,
         status, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, 'open', ?)`,
    )
    .run(
      id,
      input.subscriptionId,
      input.start,
      input.end,
      Math.max(0, Math.floor(input.includedWeightedTokens)),
      now,
    );

  return openPeriodRow(db, input.subscriptionId);
}

export async function closeSubscriptionPeriod(
  db: PostgresDatabase,
  subscriptionId: string,
) {
  if (!(await lockSubscription(db, subscriptionId))) return;

  const period = await lockOpenPeriod(db, subscriptionId);

  if (!period) return;

  await db
    .prepare(
      `UPDATE subscription_periods SET status = 'closed'
        WHERE id = ? AND status = 'open'`,
    )
    .run(period.id);
}

export { sweepSubscriptions };
