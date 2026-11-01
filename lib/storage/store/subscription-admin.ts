import type { PostgresDatabase } from "../pg-adapter.ts";
import type { SubscriptionSummary } from "../../types.ts";

import { randomUUID } from "node:crypto";

import { intervalEndIso } from "../../plan-lifecycle.ts";

import { getPlanById, planEntitlementIds } from "./plan-rows.ts";
import {
  closeSubscriptionPeriod,
  openSubscriptionPeriod,
  sweepSubscriptions,
} from "./subscription-access.ts";
import {
  activeSubscriptionRow,
  getSubscriptionSummary,
  subscriptionRowById,
} from "./subscription-rows.ts";

/**
 * Operator subscription actions, ported to the async handle (FID-086 Batch A).
 *
 * A manual grant inserts an `active` row, which the partial unique index
 * `subscriptions(user_id) WHERE status IN ('active','past_due')` — new in the
 * PostgreSQL schema — refuses if a second grant lands concurrently. The check
 * above the insert is therefore an optimisation, not the guarantee: the
 * guarantee is the index, and its violation is mapped to the same 409 the check
 * returns so the caller sees one answer either way.
 *
 * A period is always closed before a new one opens. Two open periods would make
 * `openPeriodRow` ambiguous, and the allowance arithmetic reads exactly one.
 */

export type SubscriptionMutation =
  | { ok: true; subscription: SubscriptionSummary }
  | { ok: false; status: 400 | 404 | 409; error: string };

function futureDate(input: string | null | undefined, fallback: string) {
  if (!input) return fallback;

  const parsed = Date.parse(input);

  if (!Number.isFinite(parsed) || parsed <= Date.now()) return null;

  return new Date(parsed).toISOString();
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

async function insertEntitlements(
  db: PostgresDatabase,
  subscriptionId: string,
  modelIds: string[],
) {
  const insert = db.prepare(
    `INSERT INTO subscription_models (subscription_id, model_id)
     VALUES (?, ?)
     ON CONFLICT DO NOTHING`,
  );

  for (const modelId of modelIds) await insert.run(subscriptionId, modelId);
}

export async function grantManualSubscription(
  db: PostgresDatabase,
  input: { userId: string; planId: string; periodEnd?: string | null },
): Promise<SubscriptionMutation> {
  await sweepSubscriptions(db);

  const plan = await getPlanById(db, input.planId);

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

  const user = await db
    .prepare("SELECT id FROM users WHERE id = ?")
    .get<{ id: string }>(input.userId);

  if (!user) return { ok: false, status: 404, error: "Customer not found." };

  if (await activeSubscriptionRow(db, input.userId)) {
    return {
      ok: false,
      status: 409,
      error: "This customer already has an active or past-due subscription.",
    };
  }

  const start = new Date().toISOString();
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

  try {
    await db
      .transaction(async () => {
        const incomplete = await db
          .prepare(
            `SELECT id FROM subscriptions
              WHERE user_id = ? AND status = 'incomplete'`,
          )
          .all<{ id: string }>(input.userId);

        for (const row of incomplete) await closeSubscriptionPeriod(db, row.id);

        await db
          .prepare(
            `UPDATE subscriptions SET status = 'expired', updated_at = ?
              WHERE user_id = ? AND status = 'incomplete'`,
          )
          .run(start, input.userId);

        await db
          .prepare(
            `INSERT INTO subscriptions
              (id, user_id, plan_id, status, source, stripe_customer_id,
               stripe_subscription_id, plan_name_snapshot, price_micros_snapshot,
               currency_snapshot, interval_snapshot,
               included_weighted_tokens_snapshot, overage_mode_snapshot,
               overage_markup_bps_snapshot, current_period_start,
               current_period_end, cancel_at_period_end, created_at, updated_at)
             VALUES (?, ?, ?, 'active', 'manual', NULL, NULL, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, 0, ?, ?)`,
          )
          .run(
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

        await insertEntitlements(db, id, plan.modelIds);
        await openSubscriptionPeriod(db, {
          subscriptionId: id,
          start,
          end,
          includedWeightedTokens: plan.includedWeightedTokens,
        });
      })
      .immediate();
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        status: 409,
        error: "This customer already has an active or past-due subscription.",
      };
    }

    throw error;
  }

  return { ok: true, subscription: (await getSubscriptionSummary(db, id))! };
}

export async function extendSubscription(
  db: PostgresDatabase,
  input: { subscriptionId: string; periodEnd?: string | null },
): Promise<SubscriptionMutation> {
  const row = await subscriptionRowById(db, input.subscriptionId);

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

  await db
    .transaction(async () => {
      await closeSubscriptionPeriod(db, row.id);
      await openSubscriptionPeriod(db, {
        subscriptionId: row.id,
        start: base,
        end,
        includedWeightedTokens: Number(row.included_weighted_tokens_snapshot),
      });

      await db
        .prepare(
          `UPDATE subscriptions
              SET status = 'active', current_period_start = ?,
                  current_period_end = ?, cancel_at_period_end = 0, updated_at = ?
            WHERE id = ?`,
        )
        .run(base, end, new Date().toISOString(), row.id);
    })
    .immediate();

  return {
    ok: true,
    subscription: (await getSubscriptionSummary(db, row.id))!,
  };
}

export async function refreshSubscriptionEntitlements(
  db: PostgresDatabase,
  subscriptionId: string,
): Promise<SubscriptionMutation> {
  const row = await subscriptionRowById(db, subscriptionId);

  if (!row) return { ok: false, status: 404, error: "Subscription not found." };

  const modelIds = await planEntitlementIds(db, row.plan_id);

  if (modelIds.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "The current plan has no entitlements to refresh.",
    };
  }

  await db
    .transaction(async () => {
      await db
        .prepare("DELETE FROM subscription_models WHERE subscription_id = ?")
        .run(row.id);
      await insertEntitlements(db, row.id, modelIds);
      await db
        .prepare("UPDATE subscriptions SET updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), row.id);
    })
    .immediate();

  return {
    ok: true,
    subscription: (await getSubscriptionSummary(db, row.id))!,
  };
}
