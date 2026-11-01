import type { PostgresDatabase } from "../pg-adapter.ts";

import { randomUUID } from "node:crypto";

import { decideAllowance } from "../../plans.ts";
import { quarantineHold } from "../ledger/settlements.ts";

import {
  activeSubscriptionRow,
  openPeriodRow,
  type PeriodRow,
} from "./subscription-rows.ts";

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
const INCOMPLETE_TTL_MS = 24 * 60 * 60 * 1000;

/** Expired allowance holds are quarantined, not silently returned. */
async function quarantineExpiredHolds(db: PostgresDatabase, now: number) {
  const cutoff = new Date(now).toISOString();
  const expired = await db
    .prepare(
      `SELECT id, period_id, user_id, api_key_id, model_id, weighted_tokens,
              created_at, expires_at
         FROM subscription_holds WHERE expires_at <= ?`,
    )
    .all<{
      id: string;
      period_id: string;
      user_id: string;
      api_key_id: string | null;
      model_id: string | null;
      weighted_tokens: number;
      created_at: string;
      expires_at: string;
    }>(cutoff);

  if (expired.length === 0) return;

  await db
    .transaction(async () => {
      for (const hold of expired) {
        await quarantineHold(db, {
          id: hold.id,
          kind: "subscription",
          userId: hold.user_id,
          keyId: hold.api_key_id,
          modelId: hold.model_id,
          periodId: hold.period_id,
          reserved: Number(hold.weighted_tokens),
          createdAt: hold.created_at,
          expiredAt: hold.expires_at,
        });

        await db
          .prepare("DELETE FROM subscription_holds WHERE id = ?")
          .run(hold.id);
      }
    })
    .immediate();
}

/** Local safety net for missed Stripe events and manual grants. */
export async function sweepSubscriptions(
  db: PostgresDatabase,
  now = Date.now(),
) {
  const stamp = new Date(now).toISOString();
  const incompleteCutoff = new Date(now - INCOMPLETE_TTL_MS).toISOString();

  await db
    .transaction(async () => {
      await quarantineExpiredHolds(db, now);

      await db
        .prepare(
          `UPDATE subscription_periods SET status = 'closed'
            WHERE status = 'open' AND subscription_id IN (
              SELECT id FROM subscriptions
               WHERE (status IN ('active', 'past_due') AND current_period_end <= ?)
                  OR (status = 'incomplete' AND created_at <= ?)
            )`,
        )
        .run(stamp, incompleteCutoff);

      await db
        .prepare(
          `UPDATE subscriptions SET status = 'expired', updated_at = ?
            WHERE status IN ('active', 'past_due') AND current_period_end <= ?`,
        )
        .run(stamp, stamp);

      await db
        .prepare(
          `UPDATE subscriptions SET status = 'expired', updated_at = ?
            WHERE status = 'incomplete' AND created_at <= ?`,
        )
        .run(stamp, incompleteCutoff);
    })
    .immediate();
}

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
      const period = await openPeriodRow(db, subscription.id);

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
        overageMode: subscription.overage_mode_snapshot,
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
          subscriptionId: subscription.id,
          periodId: period.id,
          markupBps: Number(subscription.overage_markup_bps_snapshot),
        };
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
          subscription.id,
          period.id,
          input.userId,
          input.keyId,
          input.modelId,
          estimate,
          createdAt,
          expiresAt,
        );

      await db
        .prepare(
          `UPDATE subscription_periods
              SET weighted_tokens_held = weighted_tokens_held + ?
            WHERE id = ?`,
        )
        .run(estimate, period.id);

      return {
        kind: "included" as const,
        subscriptionId: subscription.id,
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
  const hold = await db
    .prepare(
      `SELECT id, period_id, weighted_tokens FROM subscription_holds
        WHERE id = ?`,
    )
    .get<{ id: string; period_id: string; weighted_tokens: number }>(holdId);

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

  await db
    .prepare(
      `UPDATE subscription_periods SET status = 'closed'
        WHERE subscription_id = ? AND status = 'open'`,
    )
    .run(input.subscriptionId);

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
  await db
    .prepare(
      `UPDATE subscription_periods SET status = 'closed'
        WHERE subscription_id = ? AND status = 'open'`,
    )
    .run(subscriptionId);
}
