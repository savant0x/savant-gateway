import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  SubscriptionInvoiceSummary,
  SubscriptionSummary,
} from "../../types.ts";

import { allowanceFor } from "../../plans.ts";

/**
 * Subscription read model, ported to the async handle (FID-085 step 4).
 *
 * A subscription is a snapshot: the plan's price, allowance, interval and
 * overage policy are copied onto the row at purchase, so editing a plan changes
 * future checkouts only. That is why every summary field reads the `*_snapshot`
 * column and never joins `plans` for a price.
 *
 * `toSubscriptionSummary` is asynchronous because it composes the open period,
 * the entitlement count and the recent invoices. `BIGINT` columns arrive as
 * strings, so they are coerced here rather than in the mapper.
 *
 * Ordering takes an explicit `::timestamptz` cast on the stored ISO text.
 */

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

export async function subscriptionRows(
  db: PostgresDatabase,
  where = "",
  params: unknown[] = [],
  limit = 100,
) {
  return db
    .prepare(
      `${SELECT} ${where ? `WHERE ${where}` : ""}
       ORDER BY s.created_at::timestamptz DESC LIMIT ?`,
    )
    .all<SubscriptionRow>(...params, limit);
}

export async function subscriptionRowById(db: PostgresDatabase, id: string) {
  return db.prepare(`${SELECT} WHERE s.id = ?`).get<SubscriptionRow>(id);
}

export async function subscriptionRowByStripeId(
  db: PostgresDatabase,
  stripeId: string,
) {
  return db
    .prepare(`${SELECT} WHERE s.stripe_subscription_id = ?`)
    .get<SubscriptionRow>(stripeId);
}

export async function activeSubscriptionRow(
  db: PostgresDatabase,
  userId: string,
) {
  return db
    .prepare(
      `${SELECT} WHERE s.user_id = ?
         AND s.status IN ('active', 'past_due')
         ORDER BY s.created_at::timestamptz DESC LIMIT 1`,
    )
    .get<SubscriptionRow>(userId);
}

export async function openPeriodRow(
  db: PostgresDatabase,
  subscriptionId: string,
) {
  return db
    .prepare(
      `SELECT * FROM subscription_periods
        WHERE subscription_id = ? AND status = 'open'
        ORDER BY period_start::timestamptz DESC LIMIT 1`,
    )
    .get<PeriodRow>(subscriptionId);
}

type InvoiceRow = {
  id: string;
  amount_micros: number;
  currency: string;
  status: "paid" | "failed" | "open" | "void";
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  created_at: string;
};

export async function invoiceRows(
  db: PostgresDatabase,
  subscriptionId: string,
  limit = 8,
) {
  return db
    .prepare(
      `SELECT * FROM subscription_invoices
        WHERE subscription_id = ?
        ORDER BY created_at::timestamptz DESC LIMIT ?`,
    )
    .all<InvoiceRow>(subscriptionId, limit);
}

/** Invoice state by provider id, so webhook retries stay idempotent. */
export async function invoiceStatus(
  db: PostgresDatabase,
  providerInvoiceId: string,
) {
  const row = await db
    .prepare(
      "SELECT status FROM subscription_invoices WHERE provider_invoice_id = ?",
    )
    .get<{ status: string }>(providerInvoiceId);

  return row?.status ?? null;
}

async function invoicesFor(
  db: PostgresDatabase,
  subscriptionId: string,
): Promise<SubscriptionInvoiceSummary[]> {
  return (await invoiceRows(db, subscriptionId)).map((row) => ({
    id: row.id,
    amountMicros: Number(row.amount_micros),
    currency: row.currency,
    status: row.status,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  }));
}

export async function entitlementCount(
  db: PostgresDatabase,
  subscriptionId: string,
) {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM subscription_models WHERE subscription_id = ?",
    )
    .get<{ count: number }>(subscriptionId);

  return Number(row?.count ?? 0);
}

export async function toSubscriptionSummary(
  db: PostgresDatabase,
  row: SubscriptionRow,
): Promise<SubscriptionSummary> {
  const period = await openPeriodRow(db, row.id);
  const included =
    Number(period?.included_weighted_tokens ?? 0) ||
    Number(row.included_weighted_tokens_snapshot);
  const allowance = allowanceFor(
    included,
    Number(period?.weighted_tokens_used ?? 0),
    Number(period?.weighted_tokens_held ?? 0),
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
      priceMicros: Number(row.price_micros_snapshot),
      currency: row.currency_snapshot,
      interval: row.interval_snapshot,
      includedWeightedTokens: Number(row.included_weighted_tokens_snapshot),
      overageMode: row.overage_mode_snapshot,
      overageMarkupBps: Number(row.overage_markup_bps_snapshot),
    },
    status: row.status,
    source: row.source,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: Number(row.cancel_at_period_end) === 1,
    entitlementCount: await entitlementCount(db, row.id),
    allowance,
    invoices: await invoicesFor(db, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getSubscriptionSummary(db: PostgresDatabase, id: string) {
  const row = await subscriptionRowById(db, id);

  return row ? toSubscriptionSummary(db, row) : null;
}

export async function listSubscriptionSummaries(
  db: PostgresDatabase,
  limit = 100,
) {
  const rows = await subscriptionRows(db, "", [], limit);

  return Promise.all(rows.map((row) => toSubscriptionSummary(db, row)));
}

export async function customerSubscriptionRow(
  db: PostgresDatabase,
  userId: string,
) {
  const active = await activeSubscriptionRow(db, userId);

  if (active) return active;

  return db
    .prepare(
      `${SELECT} WHERE s.user_id = ?
        ORDER BY s.created_at::timestamptz DESC LIMIT 1`,
    )
    .get<SubscriptionRow>(userId);
}

export async function customerSubscriptionSummary(
  db: PostgresDatabase,
  userId: string,
) {
  const row = await customerSubscriptionRow(db, userId);

  return row ? toSubscriptionSummary(db, row) : null;
}
