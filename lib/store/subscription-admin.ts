import "server-only";

import type { SubscriptionSummary } from "../types";

import { randomUUID } from "node:crypto";

import { db, nowIso } from "../db";
import { intervalEndIso } from "../plan-lifecycle";

import { getPlanById, planEntitlementIds } from "./plan-rows";
import {
  closeSubscriptionPeriod,
  openSubscriptionPeriod,
  sweepSubscriptions,
} from "./subscription-access";
import {
  activeSubscriptionRow,
  getSubscriptionSummary,
  subscriptionRowById,
} from "./subscription-rows";

export type SubscriptionMutation =
  | { ok: true; subscription: SubscriptionSummary }
  | { ok: false; status: 400 | 404 | 409; error: string };

function futureDate(input: string | null | undefined, fallback: string) {
  if (!input) return fallback;

  const parsed = Date.parse(input);

  if (!Number.isFinite(parsed) || parsed <= Date.now()) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function insertEntitlements(subscriptionId: string, modelIds: string[]) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO subscription_models (subscription_id, model_id)
     VALUES (?, ?)`,
  );

  for (const modelId of modelIds) insert.run(subscriptionId, modelId);
}

export function grantManualSubscription(input: {
  userId: string;
  planId: string;
  periodEnd?: string | null;
}): SubscriptionMutation {
  sweepSubscriptions();

  const plan = getPlanById(input.planId);

  if (!plan) return { ok: false, status: 404, error: "Plan not found." };

  if (plan.status === "draft") {
    return { ok: false, status: 400, error: "Draft plans cannot be granted." };
  }

  if (plan.modelCount === 0) {
    return {
      ok: false,
      status: 400,
      error: "This plan has no included models.",
    };
  }

  const user = db
    .prepare("SELECT id FROM users WHERE id = ?")
    .get(input.userId) as { id: string } | undefined;

  if (!user) return { ok: false, status: 404, error: "Customer not found." };

  if (activeSubscriptionRow(input.userId)) {
    return {
      ok: false,
      status: 409,
      error: "This customer already has an active or past-due subscription.",
    };
  }

  const start = nowIso();
  const defaultEnd = intervalEndIso(start, plan.interval);
  const end = futureDate(input.periodEnd, defaultEnd);

  if (!end) {
    return {
      ok: false,
      status: 400,
      error: "Period end must be in the future.",
    };
  }

  const id = `sub_${randomUUID()}`;

  db.transaction(() => {
    const incomplete = db
      .prepare(
        `SELECT id FROM subscriptions
         WHERE user_id = ? AND status = 'incomplete'`,
      )
      .all(input.userId) as Array<{ id: string }>;

    for (const row of incomplete) closeSubscriptionPeriod(row.id);

    db.prepare(
      `UPDATE subscriptions SET status = 'expired', updated_at = ?
       WHERE user_id = ? AND status = 'incomplete'`,
    ).run(start, input.userId);

    db.prepare(
      `INSERT INTO subscriptions
        (id, user_id, plan_id, status, source, stripe_customer_id,
         stripe_subscription_id, plan_name_snapshot, price_micros_snapshot,
         currency_snapshot, interval_snapshot, included_weighted_tokens_snapshot,
         overage_mode_snapshot, overage_markup_bps_snapshot,
         current_period_start, current_period_end, cancel_at_period_end,
         created_at, updated_at)
       VALUES (?, ?, ?, 'active', 'manual', NULL, NULL, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, 0, ?, ?)`,
    ).run(
      id,
      input.userId,
      plan.id,
      plan.name,
      plan.priceMicros,
      plan.currency,
      plan.interval,
      plan.includedWeightedTokens,
      plan.overageMode,
      plan.overageMarkupBps,
      start,
      end,
      start,
      start,
    );

    insertEntitlements(id, plan.modelIds);
    openSubscriptionPeriod({
      subscriptionId: id,
      start,
      end,
      includedWeightedTokens: plan.includedWeightedTokens,
    });
  }).immediate();

  return { ok: true, subscription: getSubscriptionSummary(id)! };
}

export function extendSubscription(input: {
  subscriptionId: string;
  periodEnd?: string | null;
}): SubscriptionMutation {
  const row = subscriptionRowById(input.subscriptionId);

  if (!row) return { ok: false, status: 404, error: "Subscription not found." };

  if (row.source === "stripe") {
    return {
      ok: false,
      status: 400,
      error: "Stripe subscriptions renew automatically; use Sync instead.",
    };
  }

  const now = Date.now();
  const currentEnd = Date.parse(row.current_period_end);
  const baseMs = Number.isFinite(currentEnd) ? Math.max(currentEnd, now) : now;
  const base = new Date(baseMs).toISOString();
  const defaultEnd = intervalEndIso(base, row.interval_snapshot);
  const end = futureDate(input.periodEnd, defaultEnd);

  if (!end) {
    return {
      ok: false,
      status: 400,
      error: "Period end must be in the future.",
    };
  }

  if (Date.parse(end) < baseMs) {
    return {
      ok: false,
      status: 400,
      error: "The new period end must move forward.",
    };
  }

  db.transaction(() => {
    closeSubscriptionPeriod(row.id);
    openSubscriptionPeriod({
      subscriptionId: row.id,
      start: base,
      end,
      includedWeightedTokens: row.included_weighted_tokens_snapshot,
    });

    db.prepare(
      `UPDATE subscriptions
       SET status = 'active', current_period_start = ?, current_period_end = ?,
           cancel_at_period_end = 0, updated_at = ?
       WHERE id = ?`,
    ).run(base, end, nowIso(), row.id);
  }).immediate();

  return { ok: true, subscription: getSubscriptionSummary(row.id)! };
}

export function refreshSubscriptionEntitlements(
  subscriptionId: string,
): SubscriptionMutation {
  const row = subscriptionRowById(subscriptionId);

  if (!row) return { ok: false, status: 404, error: "Subscription not found." };

  const modelIds = planEntitlementIds(row.plan_id);

  if (modelIds.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "The current plan has no entitlements to refresh.",
    };
  }

  db.transaction(() => {
    db.prepare("DELETE FROM subscription_models WHERE subscription_id = ?").run(
      row.id,
    );
    insertEntitlements(row.id, modelIds);
    db.prepare("UPDATE subscriptions SET updated_at = ? WHERE id = ?").run(
      nowIso(),
      row.id,
    );
  }).immediate();

  return { ok: true, subscription: getSubscriptionSummary(row.id)! };
}
