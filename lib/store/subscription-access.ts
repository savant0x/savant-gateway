import "server-only";

import { randomUUID } from "node:crypto";

import { db, nowIso } from "../db";
import { decideAllowance } from "../plans";
import { quarantineHold } from "../settlement-ledger";

import {
  activeSubscriptionRow,
  openPeriodRow,
  type PeriodRow,
} from "./subscription-rows";

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
function quarantineExpiredHolds(now: number) {
  const cutoff = new Date(now).toISOString();
  const expired = db
    .prepare(
      `SELECT id, period_id, user_id, api_key_id, model_id, weighted_tokens,
              created_at, expires_at
       FROM subscription_holds WHERE expires_at <= ?`,
    )
    .all(cutoff) as Array<{
    id: string;
    period_id: string;
    user_id: string;
    api_key_id: string | null;
    model_id: string | null;
    weighted_tokens: number;
    created_at: string;
    expires_at: string;
  }>;

  db.transaction(() => {
    for (const hold of expired) {
      quarantineHold(db, {
        id: hold.id,
        kind: "subscription",
        userId: hold.user_id,
        keyId: hold.api_key_id,
        modelId: hold.model_id,
        periodId: hold.period_id,
        reserved: hold.weighted_tokens,
        createdAt: hold.created_at,
        expiredAt: hold.expires_at,
      });
      db.prepare("DELETE FROM subscription_holds WHERE id = ?").run(hold.id);
    }
  }).immediate();
}

/** Local safety net for missed Stripe events and manual grants. */
export function sweepSubscriptions(now = Date.now()) {
  const stamp = new Date(now).toISOString();
  const incompleteCutoff = new Date(now - INCOMPLETE_TTL_MS).toISOString();

  db.transaction(() => {
    quarantineExpiredHolds(now);

    db.prepare(
      `UPDATE subscription_periods SET status = 'closed'
       WHERE status = 'open' AND subscription_id IN (
         SELECT id FROM subscriptions
         WHERE (status IN ('active', 'past_due') AND current_period_end <= ?)
            OR (status = 'incomplete' AND created_at <= ?)
       )`,
    ).run(stamp, incompleteCutoff);

    db.prepare(
      `UPDATE subscriptions SET status = 'expired', updated_at = ?
       WHERE status IN ('active', 'past_due') AND current_period_end <= ?`,
    ).run(stamp, stamp);

    db.prepare(
      `UPDATE subscriptions SET status = 'expired', updated_at = ?
       WHERE status = 'incomplete' AND created_at <= ?`,
    ).run(stamp, incompleteCutoff);
  }).immediate();
}

function coveredByPlan(subscriptionId: string, modelId: string) {
  return Boolean(
    db
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
export function resolveSubscriptionAccess(input: {
  userId: string;
  keyId: string;
  modelId: string;
  estimateWeightedTokens: number;
  now?: number;
}): SubscriptionAccess {
  const now = input.now ?? Date.now();

  sweepSubscriptions(now);

  const subscription = activeSubscriptionRow(input.userId);

  if (!subscription) return { kind: "none" };

  if (subscription.status === "past_due") {
    return blocked(
      "subscription_past_due",
      "This subscription is past due. Update payment in the billing portal.",
    );
  }

  if (!coveredByPlan(subscription.id, input.modelId)) {
    return { kind: "none" };
  }

  const estimate = Math.max(1, Math.ceil(input.estimateWeightedTokens));
  const holdId = `subhold_${randomUUID()}`;
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + HOLD_TTL_MS).toISOString();

  const decision = db
    .transaction(() => {
      const period = openPeriodRow(subscription.id);

      if (!period) {
        return blocked(
          "subscription_period_missing",
          "This subscription has no open allowance period. Contact the operator.",
          503,
        );
      }

      const next = decideAllowance({
        includedWeightedTokens: period.included_weighted_tokens,
        usedWeightedTokens: period.weighted_tokens_used,
        heldWeightedTokens: period.weighted_tokens_held,
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
          markupBps: subscription.overage_markup_bps_snapshot,
        };
      }

      db.prepare(
        `INSERT INTO subscription_holds
          (id, subscription_id, period_id, user_id, api_key_id, model_id,
           weighted_tokens, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
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

      db.prepare(
        `UPDATE subscription_periods
         SET weighted_tokens_held = weighted_tokens_held + ?
         WHERE id = ?`,
      ).run(estimate, period.id);

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

  return decision;
}

/** Runs inside recordUsage's transaction so usage and allowance settle atomically. */
export function settleSubscriptionHoldWithin(
  holdId: string,
  actualWeightedTokens: number,
) {
  const hold = db
    .prepare(
      `SELECT id, period_id, weighted_tokens FROM subscription_holds
       WHERE id = ?`,
    )
    .get(holdId) as
    { id: string; period_id: string; weighted_tokens: number } | undefined;

  if (!hold) return 0;

  db.prepare("DELETE FROM subscription_holds WHERE id = ?").run(holdId);
  db.prepare(
    `UPDATE subscription_periods
     SET weighted_tokens_held = MAX(0, weighted_tokens_held - ?),
         weighted_tokens_used = weighted_tokens_used + ?
     WHERE id = ?`,
  ).run(
    hold.weighted_tokens,
    Math.max(0, Math.floor(actualWeightedTokens)),
    hold.period_id,
  );

  return hold.period_id;
}

export function openSubscriptionPeriod(input: {
  subscriptionId: string;
  start: string;
  end: string;
  includedWeightedTokens: number;
}): PeriodRow {
  const id = `period_${randomUUID()}`;
  const now = nowIso();

  db.prepare(
    `UPDATE subscription_periods SET status = 'closed'
     WHERE subscription_id = ? AND status = 'open'`,
  ).run(input.subscriptionId);

  db.prepare(
    `INSERT INTO subscription_periods
      (id, subscription_id, period_start, period_end,
       included_weighted_tokens, weighted_tokens_used, weighted_tokens_held,
       status, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, 'open', ?)`,
  ).run(
    id,
    input.subscriptionId,
    input.start,
    input.end,
    Math.max(0, Math.floor(input.includedWeightedTokens)),
    now,
  );

  return openPeriodRow(input.subscriptionId)!;
}

export function closeSubscriptionPeriod(subscriptionId: string) {
  db.prepare(
    `UPDATE subscription_periods SET status = 'closed'
     WHERE subscription_id = ? AND status = 'open'`,
  ).run(subscriptionId);
}
