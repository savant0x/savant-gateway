import "server-only";

import type { SubscriptionInvoiceSummary, SubscriptionSummary } from "../types";

import { db } from "../db";
import { allowanceFor } from "../plans";

export type SubscriptionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  status: "incomplete" | "active" | "past_due" | "canceled" | "expired";
  source: "stripe" | "manual";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_name_snapshot: string;
  price_micros_snapshot: number;
  currency_snapshot: string;
  interval_snapshot: "month" | "year";
  included_weighted_tokens_snapshot: number;
  overage_mode_snapshot: "block" | "credit";
  overage_markup_bps_snapshot: number;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: number;
  created_at: string;
  updated_at: string;
  customer_name: string;
  customer_email: string;
  plan_slug: string | null;
};

export type PeriodRow = {
  id: string;
  subscription_id: string;
  period_start: string;
  period_end: string;
  included_weighted_tokens: number;
  weighted_tokens_used: number;
  weighted_tokens_held: number;
  status: "open" | "closed";
  created_at: string;
};

const SELECT = `
  SELECT s.*, u.name AS customer_name, u.email AS customer_email,
    p.slug AS plan_slug
  FROM subscriptions s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN plans p ON p.id = s.plan_id
`;

export function subscriptionRows(
  where = "",
  params: unknown[] = [],
  limit = 100,
) {
  return db
    .prepare(
      `${SELECT} ${where ? `WHERE ${where}` : ""}
       ORDER BY datetime(s.created_at) DESC LIMIT ?`,
    )
    .all(...params, limit) as SubscriptionRow[];
}

export function subscriptionRowById(id: string) {
  return db.prepare(`${SELECT} WHERE s.id = ?`).get(id) as
    SubscriptionRow | undefined;
}

export function subscriptionRowByStripeId(stripeId: string) {
  return db
    .prepare(`${SELECT} WHERE s.stripe_subscription_id = ?`)
    .get(stripeId) as SubscriptionRow | undefined;
}

export function activeSubscriptionRow(userId: string) {
  return db
    .prepare(
      `${SELECT} WHERE s.user_id = ?
       AND s.status IN ('active', 'past_due')
       ORDER BY datetime(s.created_at) DESC LIMIT 1`,
    )
    .get(userId) as SubscriptionRow | undefined;
}

export function openPeriodRow(subscriptionId: string) {
  return db
    .prepare(
      `SELECT * FROM subscription_periods
       WHERE subscription_id = ? AND status = 'open'
       ORDER BY datetime(period_start) DESC LIMIT 1`,
    )
    .get(subscriptionId) as PeriodRow | undefined;
}

export function invoiceRows(subscriptionId: string, limit = 8) {
  return db
    .prepare(
      `SELECT * FROM subscription_invoices
       WHERE subscription_id = ?
       ORDER BY datetime(created_at) DESC LIMIT ?`,
    )
    .all(subscriptionId, limit) as Array<{
    id: string;
    amount_micros: number;
    currency: string;
    status: "paid" | "failed" | "open" | "void";
    period_start: string | null;
    period_end: string | null;
    paid_at: string | null;
    created_at: string;
  }>;
}

/** Invoice state by provider id, so webhook retries stay idempotent. */
export function invoiceStatus(providerInvoiceId: string) {
  const row = db
    .prepare(
      "SELECT status FROM subscription_invoices WHERE provider_invoice_id = ?",
    )
    .get(providerInvoiceId) as { status: string } | undefined;

  return row?.status ?? null;
}

function invoicesFor(subscriptionId: string): SubscriptionInvoiceSummary[] {
  return invoiceRows(subscriptionId).map((row) => ({
    id: row.id,
    amountMicros: row.amount_micros,
    currency: row.currency,
    status: row.status,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  }));
}

export function entitlementCount(subscriptionId: string) {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS count FROM subscription_models WHERE subscription_id = ?",
    )
    .get(subscriptionId) as { count: number };

  return row.count;
}

export function toSubscriptionSummary(
  row: SubscriptionRow,
): SubscriptionSummary {
  const period = openPeriodRow(row.id);
  const included =
    period?.included_weighted_tokens ?? row.included_weighted_tokens_snapshot;
  const allowance = allowanceFor(
    included,
    period?.weighted_tokens_used ?? 0,
    period?.weighted_tokens_held ?? 0,
  );

  return {
    id: row.id,
    userId: row.user_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    planId: row.plan_id,
    planSlug: row.plan_slug,
    plan: {
      name: row.plan_name_snapshot,
      priceMicros: row.price_micros_snapshot,
      currency: row.currency_snapshot,
      interval: row.interval_snapshot,
      includedWeightedTokens: row.included_weighted_tokens_snapshot,
      overageMode: row.overage_mode_snapshot,
      overageMarkupBps: row.overage_markup_bps_snapshot,
    },
    status: row.status,
    source: row.source,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end === 1,
    entitlementCount: entitlementCount(row.id),
    allowance,
    invoices: invoicesFor(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getSubscriptionSummary(id: string) {
  const row = subscriptionRowById(id);

  return row ? toSubscriptionSummary(row) : null;
}

export function listSubscriptionSummaries(limit = 100) {
  return subscriptionRows("", [], limit).map(toSubscriptionSummary);
}

export function customerSubscriptionRow(userId: string) {
  const active = activeSubscriptionRow(userId);

  if (active) return active;

  return db
    .prepare(
      `${SELECT} WHERE s.user_id = ? ORDER BY datetime(s.created_at) DESC LIMIT 1`,
    )
    .get(userId) as SubscriptionRow | undefined;
}

export function customerSubscriptionSummary(userId: string) {
  const row = customerSubscriptionRow(userId);

  return row ? toSubscriptionSummary(row) : null;
}
