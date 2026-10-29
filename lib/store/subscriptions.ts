import "server-only";

import type { PlanSummary, SubscriptionSummary } from "../types";

import { randomUUID } from "node:crypto";

import { db, nowIso } from "../db";
import { intervalEndIso, mapStripeSubscriptionStatus } from "../plan-lifecycle";

import { planEntitlementIds } from "./plan-rows";
import {
  activeSubscriptionRow,
  customerSubscriptionSummary,
  entitlementCount,
  getSubscriptionSummary,
  invoiceStatus,
  listSubscriptionSummaries,
  subscriptionRowById,
  subscriptionRowByStripeId,
} from "./subscription-rows";
import {
  closeSubscriptionPeriod,
  openSubscriptionPeriod,
  sweepSubscriptions,
} from "./subscription-access";

export {
  customerSubscriptionSummary,
  getSubscriptionSummary,
  listSubscriptionSummaries,
  sweepSubscriptions,
};

export type SubscriptionMutation =
  | { ok: true; subscription: SubscriptionSummary }
  | { ok: false; status: 400 | 404 | 409; error: string };

function insertEntitlements(subscriptionId: string, modelIds: string[]) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO subscription_models (subscription_id, model_id)
     VALUES (?, ?)`,
  );

  for (const modelId of modelIds) insert.run(subscriptionId, modelId);
}

function expireIncompleteForUser(userId: string) {
  const rows = db
    .prepare(
      "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'incomplete'",
    )
    .all(userId) as Array<{ id: string }>;

  for (const row of rows) {
    closeSubscriptionPeriod(row.id);
    db.prepare(
      "UPDATE subscriptions SET status = 'expired', updated_at = ? WHERE id = ?",
    ).run(nowIso(), row.id);
  }
}

export function createStripeCheckoutSubscription(input: {
  userId: string;
  plan: PlanSummary;
}): SubscriptionMutation {
  sweepSubscriptions();

  if (activeSubscriptionRow(input.userId)) {
    return {
      ok: false,
      status: 409,
      error: "You already have an active or past-due subscription.",
    };
  }

  if (input.plan.status !== "active") {
    return { ok: false, status: 409, error: "This plan is not available." };
  }

  if (input.plan.modelCount === 0) {
    return {
      ok: false,
      status: 409,
      error: "This plan has no included models.",
    };
  }

  const user = db
    .prepare("SELECT id FROM users WHERE id = ? AND password_hash IS NOT NULL")
    .get(input.userId) as { id: string } | undefined;

  if (!user) {
    return { ok: false, status: 404, error: "Customer not found." };
  }

  const now = nowIso();
  const id = `sub_${randomUUID()}`;
  const periodEnd = intervalEndIso(now, input.plan.interval);

  db.transaction(() => {
    expireIncompleteForUser(input.userId);

    db.prepare(
      `INSERT INTO subscriptions
        (id, user_id, plan_id, status, source, stripe_customer_id,
         stripe_subscription_id, plan_name_snapshot, price_micros_snapshot,
         currency_snapshot, interval_snapshot, included_weighted_tokens_snapshot,
         overage_mode_snapshot, overage_markup_bps_snapshot,
         current_period_start, current_period_end, cancel_at_period_end,
         created_at, updated_at)
       VALUES (?, ?, ?, 'incomplete', 'stripe', NULL, NULL, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, 0, ?, ?)`,
    ).run(
      id,
      input.userId,
      input.plan.id,
      input.plan.name,
      input.plan.priceMicros,
      input.plan.currency,
      input.plan.interval,
      input.plan.includedWeightedTokens,
      input.plan.overageMode,
      input.plan.overageMarkupBps,
      now,
      periodEnd,
      now,
      now,
    );

    insertEntitlements(id, input.plan.modelIds);
    openSubscriptionPeriod({
      subscriptionId: id,
      start: now,
      end: periodEnd,
      includedWeightedTokens: input.plan.includedWeightedTokens,
    });
  }).immediate();

  return { ok: true, subscription: getSubscriptionSummary(id)! };
}

export function attachStripeCheckout(input: {
  subscriptionId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}) {
  db.transaction(() => {
    db.prepare(
      `UPDATE subscriptions
       SET stripe_customer_id = ?, stripe_subscription_id = ?, updated_at = ?
       WHERE id = ? AND status = 'incomplete'`,
    ).run(
      input.stripeCustomerId,
      input.stripeSubscriptionId,
      nowIso(),
      input.subscriptionId,
    );

    db.prepare(
      `UPDATE users SET stripe_customer_id = ?
       WHERE id = (SELECT user_id FROM subscriptions WHERE id = ?)
         AND stripe_customer_id IS NULL`,
    ).run(input.stripeCustomerId, input.subscriptionId);
  }).immediate();
}

export function findSubscriptionIdByStripeId(stripeId: string) {
  return subscriptionRowByStripeId(stripeId)?.id ?? null;
}

export function findSubscriptionIdByStripeCustomer(customerId: string) {
  const row = db
    .prepare(
      `SELECT id FROM subscriptions WHERE stripe_customer_id = ?
       ORDER BY datetime(created_at) DESC LIMIT 1`,
    )
    .get(customerId) as { id: string } | undefined;

  return row?.id ?? null;
}

export type InvoiceInput = {
  providerInvoiceId: string | null;
  amountMicros: number;
  currency: string;
  status: "paid" | "failed" | "open" | "void";
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
};

export function recordSubscriptionInvoice(
  subscriptionId: string,
  invoice: InvoiceInput,
) {
  db.prepare(
    `INSERT INTO subscription_invoices
      (id, subscription_id, provider_invoice_id, amount_micros, currency,
       status, period_start, period_end, paid_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider_invoice_id) DO UPDATE SET
       subscription_id = excluded.subscription_id,
       amount_micros = excluded.amount_micros,
       currency = excluded.currency,
       status = excluded.status,
       period_start = excluded.period_start,
       period_end = excluded.period_end,
       paid_at = excluded.paid_at`,
  ).run(
    `inv_${randomUUID()}`,
    subscriptionId,
    invoice.providerInvoiceId,
    Math.max(0, Math.round(invoice.amountMicros)),
    invoice.currency || "usd",
    invoice.status,
    invoice.periodStart,
    invoice.periodEnd,
    invoice.paidAt,
    nowIso(),
  );
}

export function activateSubscription(input: {
  subscriptionId?: string;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  periodStart: string;
  periodEnd: string;
  invoice: InvoiceInput;
}): SubscriptionSummary | null {
  const row = input.subscriptionId
    ? subscriptionRowById(input.subscriptionId)
    : input.stripeSubscriptionId
      ? subscriptionRowByStripeId(input.stripeSubscriptionId)
      : undefined;

  if (!row) return null;
  if (row.status === "canceled") return null;

  if (
    input.invoice.providerInvoiceId &&
    invoiceStatus(input.invoice.providerInvoiceId) === "paid"
  ) {
    return getSubscriptionSummary(row.id);
  }

  const planModels =
    entitlementCount(row.id) === 0 ? planEntitlementIds(row.plan_id) : [];

  db.transaction(() => {
    if (planModels.length > 0) insertEntitlements(row.id, planModels);

    recordSubscriptionInvoice(row.id, input.invoice);

    openSubscriptionPeriod({
      subscriptionId: row.id,
      start: input.periodStart,
      end: input.periodEnd,
      includedWeightedTokens: row.included_weighted_tokens_snapshot,
    });

    db.prepare(
      `UPDATE subscriptions
       SET status = 'active', stripe_subscription_id = COALESCE(?, stripe_subscription_id),
           stripe_customer_id = COALESCE(?, stripe_customer_id),
           current_period_start = ?, current_period_end = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.stripeSubscriptionId ?? null,
      input.stripeCustomerId ?? null,
      input.periodStart,
      input.periodEnd,
      nowIso(),
      row.id,
    );
  }).immediate();

  return getSubscriptionSummary(row.id);
}

export function markSubscriptionPastDue(input: {
  subscriptionId?: string;
  stripeSubscriptionId?: string | null;
  invoice: InvoiceInput | null;
}) {
  const row = input.subscriptionId
    ? subscriptionRowById(input.subscriptionId)
    : input.stripeSubscriptionId
      ? subscriptionRowByStripeId(input.stripeSubscriptionId)
      : undefined;

  if (!row) return null;

  if (
    input.invoice?.providerInvoiceId &&
    invoiceStatus(input.invoice.providerInvoiceId) === "paid"
  ) {
    return getSubscriptionSummary(row.id);
  }

  db.transaction(() => {
    if (input.invoice) recordSubscriptionInvoice(row.id, input.invoice);

    db.prepare(
      `UPDATE subscriptions SET status = 'past_due', updated_at = ?
       WHERE id = ? AND status IN ('active', 'past_due', 'incomplete')`,
    ).run(nowIso(), row.id);
  }).immediate();

  return getSubscriptionSummary(row.id);
}

/**
 * Keeps incomplete checkouts unentitled until a signed invoice is paid. A null
 * period means the event carried none, so the stored value is preserved rather
 * than replaced with a plausible date.
 */
export function reconcileStripeSubscription(input: {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}) {
  const row = subscriptionRowByStripeId(input.stripeSubscriptionId);

  if (!row) return null;

  const mapped = mapStripeSubscriptionStatus(
    input.status,
    input.cancelAtPeriodEnd,
    input.periodEnd ?? row.current_period_end,
  );
  const nextStatus =
    row.status === "incomplete" && mapped === "active" ? "incomplete" : mapped;

  db.transaction(() => {
    db.prepare(
      `UPDATE subscriptions
       SET status = ?, stripe_customer_id = ?,
           current_period_start = COALESCE(?, current_period_start),
           current_period_end = COALESCE(?, current_period_end),
           cancel_at_period_end = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      nextStatus,
      input.stripeCustomerId,
      input.periodStart,
      input.periodEnd,
      input.cancelAtPeriodEnd ? 1 : 0,
      nowIso(),
      row.id,
    );

    if (nextStatus === "canceled" || nextStatus === "expired") {
      closeSubscriptionPeriod(row.id);
    }
  }).immediate();

  return getSubscriptionSummary(row.id);
}

export function setSubscriptionCancellation(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean,
) {
  const result = db
    .prepare(
      `UPDATE subscriptions SET cancel_at_period_end = ?, updated_at = ?
       WHERE id = ? AND status IN ('active', 'past_due')`,
    )
    .run(cancelAtPeriodEnd ? 1 : 0, nowIso(), subscriptionId);

  return result.changes > 0 ? getSubscriptionSummary(subscriptionId) : null;
}

/** Admin-only immediate local revocation; Stripe cancellation happens in the route. */
export function revokeSubscription(subscriptionId: string) {
  const row = subscriptionRowById(subscriptionId);

  if (!row) return null;

  db.transaction(() => {
    closeSubscriptionPeriod(subscriptionId);

    db.prepare(
      `UPDATE subscriptions
       SET status = 'canceled', cancel_at_period_end = 0, updated_at = ?
       WHERE id = ?`,
    ).run(nowIso(), subscriptionId);

    db.prepare("DELETE FROM subscription_holds WHERE subscription_id = ?").run(
      subscriptionId,
    );
  }).immediate();

  return getSubscriptionSummary(subscriptionId);
}
