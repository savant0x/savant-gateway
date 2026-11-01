import type { PostgresDatabase } from "../pg-adapter.ts";
import type { SubscriptionSummary } from "../../types.ts";

import { mapStripeSubscriptionStatus } from "../../plan-lifecycle.ts";

import { insertEntitlements } from "./subscription-entitlements.ts";
import {
  recordSubscriptionInvoice,
  type InvoiceInput,
} from "./subscription-invoices.ts";
import { planEntitlementIds } from "./plan-rows.ts";
import {
  getSubscriptionSummary,
  invoiceStatus,
  subscriptionRowById,
  subscriptionRowByStripeId,
} from "./subscription-rows.ts";
import {
  closeSubscriptionPeriod,
  openSubscriptionPeriod,
} from "./subscription-access.ts";

/**
 * Subscription lifecycle, ported to the async handle (FID-086 Batch A).
 *
 * Every state change that grants access happens in the same transaction as the
 * period it opens, and every state change that removes access closes the period
 * in the same transaction. That pairing is the invariant: a period open on a
 * canceled subscription would keep admitting calls through the allowance path.
 *
 * Two idempotency rules are carried over unchanged:
 *
 * 1. An invoice already recorded as paid short-circuits the event, so a webhook
 *    replay cannot open a second period.
 * 2. A null period on a Stripe event preserves the stored one (`COALESCE`),
 *    because "the event did not say" is not "the period is empty".
 *
 * The synchronous version used `BEGIN IMMEDIATE`. PostgreSQL has no such lock;
 * exclusion comes from the row locks these updates take and from the partial
 * unique index on an active subscription per user.
 */

async function resolveRow(
  db: PostgresDatabase,
  input: { subscriptionId?: string; stripeSubscriptionId?: string | null },
) {
  if (input.subscriptionId) {
    return subscriptionRowById(db, input.subscriptionId);
  }

  if (input.stripeSubscriptionId) {
    return subscriptionRowByStripeId(db, input.stripeSubscriptionId);
  }

  return undefined;
}

export async function attachStripeCheckout(
  db: PostgresDatabase,
  input: {
    subscriptionId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  },
) {
  await db
    .transaction(async () => {
      await db
        .prepare(
          `UPDATE subscriptions
              SET stripe_customer_id = ?, stripe_subscription_id = ?, updated_at = ?
            WHERE id = ? AND status = 'incomplete'`,
        )
        .run(
          input.stripeCustomerId,
          input.stripeSubscriptionId,
          new Date().toISOString(),
          input.subscriptionId,
        );

      // The customer id is shared across subscriptions, so it is only filled in
      // when the user has none; overwriting would silently repoint an earlier
      // checkout's billing portal.
      await db
        .prepare(
          `UPDATE users SET stripe_customer_id = ?
            WHERE id = (SELECT user_id FROM subscriptions WHERE id = ?)
              AND stripe_customer_id IS NULL`,
        )
        .run(input.stripeCustomerId, input.subscriptionId);
    })
    .immediate();
}

export async function findSubscriptionIdByStripeId(
  db: PostgresDatabase,
  stripeId: string,
) {
  return (await subscriptionRowByStripeId(db, stripeId))?.id ?? null;
}

/** Stripe can deliver an event for a checkout that has not finished attaching. */
export async function findSubscriptionIdByStripeCustomer(
  db: PostgresDatabase,
  customerId: string,
) {
  const row = await db
    .prepare(
      `SELECT id FROM subscriptions WHERE stripe_customer_id = ?
        ORDER BY created_at::timestamptz DESC LIMIT 1`,
    )
    .get<{ id: string }>(customerId);

  return row?.id ?? null;
}

export async function activateSubscription(
  db: PostgresDatabase,
  input: {
    subscriptionId?: string;
    stripeSubscriptionId?: string | null;
    stripeCustomerId?: string | null;
    periodStart: string;
    periodEnd: string;
    invoice: InvoiceInput;
  },
): Promise<SubscriptionSummary | null> {
  const row = await resolveRow(db, input);

  if (!row) return null;
  if (row.status === "canceled") return null;

  if (
    input.invoice.providerInvoiceId &&
    (await invoiceStatus(db, input.invoice.providerInvoiceId)) === "paid"
  ) {
    return getSubscriptionSummary(db, row.id);
  }

  const entitled = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM subscription_models WHERE subscription_id = ?",
    )
    .get<{ count: number | string }>(row.id);

  await db
    .transaction(async () => {
      // An incomplete checkout has no entitlements yet; a renewal of a live
      // subscription keeps the ones it already has, because refreshing them
      // here would quietly grant models added to the plan after purchase.
      if (Number(entitled?.count ?? 0) === 0) {
        await insertEntitlements(
          db,
          row.id,
          await planEntitlementIds(db, row.plan_id),
        );
      }

      await recordSubscriptionInvoice(db, row.id, input.invoice);

      await openSubscriptionPeriod(db, {
        subscriptionId: row.id,
        start: input.periodStart,
        end: input.periodEnd,
        includedWeightedTokens: Number(row.included_weighted_tokens_snapshot),
      });

      await db
        .prepare(
          `UPDATE subscriptions
              SET status = 'active',
                  stripe_subscription_id = COALESCE(?, stripe_subscription_id),
                  stripe_customer_id = COALESCE(?, stripe_customer_id),
                  current_period_start = ?, current_period_end = ?, updated_at = ?
            WHERE id = ?`,
        )
        .run(
          input.stripeSubscriptionId ?? null,
          input.stripeCustomerId ?? null,
          input.periodStart,
          input.periodEnd,
          new Date().toISOString(),
          row.id,
        );
    })
    .immediate();

  return getSubscriptionSummary(db, row.id);
}

export async function markSubscriptionPastDue(
  db: PostgresDatabase,
  input: {
    subscriptionId?: string;
    stripeSubscriptionId?: string | null;
    invoice: InvoiceInput | null;
  },
): Promise<SubscriptionSummary | null> {
  const row = await resolveRow(db, input);

  if (!row) return null;

  if (
    input.invoice?.providerInvoiceId &&
    (await invoiceStatus(db, input.invoice.providerInvoiceId)) === "paid"
  ) {
    return getSubscriptionSummary(db, row.id);
  }

  await db
    .transaction(async () => {
      if (input.invoice) {
        await recordSubscriptionInvoice(db, row.id, input.invoice);
      }

      await db
        .prepare(
          `UPDATE subscriptions SET status = 'past_due', updated_at = ?
            WHERE id = ? AND status IN ('active', 'past_due', 'incomplete')`,
        )
        .run(new Date().toISOString(), row.id);
    })
    .immediate();

  return getSubscriptionSummary(db, row.id);
}

/**
 * Keeps incomplete checkouts unentitled until a signed invoice is paid. A null
 * period means the event carried none, so the stored value is preserved rather
 * than replaced with a plausible date.
 */
export async function reconcileStripeSubscription(
  db: PostgresDatabase,
  input: {
    stripeSubscriptionId: string;
    stripeCustomerId: string;
    status: string;
    periodStart: string | null;
    periodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  },
): Promise<SubscriptionSummary | null> {
  const row = await subscriptionRowByStripeId(db, input.stripeSubscriptionId);

  if (!row) return null;

  const mapped = mapStripeSubscriptionStatus(
    input.status,
    input.cancelAtPeriodEnd,
    input.periodEnd ?? row.current_period_end,
  );
  const nextStatus =
    row.status === "incomplete" && mapped === "active" ? "incomplete" : mapped;

  await db
    .transaction(async () => {
      await db
        .prepare(
          `UPDATE subscriptions
              SET status = ?, stripe_customer_id = ?,
                  current_period_start = COALESCE(?, current_period_start),
                  current_period_end = COALESCE(?, current_period_end),
                  cancel_at_period_end = ?, updated_at = ?
            WHERE id = ?`,
        )
        .run(
          nextStatus,
          input.stripeCustomerId,
          input.periodStart,
          input.periodEnd,
          input.cancelAtPeriodEnd ? 1 : 0,
          new Date().toISOString(),
          row.id,
        );

      if (nextStatus === "canceled" || nextStatus === "expired") {
        await closeSubscriptionPeriod(db, row.id);
      }
    })
    .immediate();

  return getSubscriptionSummary(db, row.id);
}

export async function setSubscriptionCancellation(
  db: PostgresDatabase,
  subscriptionId: string,
  cancelAtPeriodEnd: boolean,
) {
  const updated = await db
    .prepare(
      `UPDATE subscriptions SET cancel_at_period_end = ?, updated_at = ?
        WHERE id = ? AND status IN ('active', 'past_due')
       RETURNING id`,
    )
    .all(cancelAtPeriodEnd ? 1 : 0, new Date().toISOString(), subscriptionId);

  return updated.length > 0 ? getSubscriptionSummary(db, subscriptionId) : null;
}

/** Admin-only immediate local revocation; Stripe cancellation happens in the route. */
export async function revokeSubscription(
  db: PostgresDatabase,
  subscriptionId: string,
) {
  const row = await subscriptionRowById(db, subscriptionId);

  if (!row) return null;

  await db
    .transaction(async () => {
      await closeSubscriptionPeriod(db, subscriptionId);

      await db
        .prepare(
          `UPDATE subscriptions
              SET status = 'canceled', cancel_at_period_end = 0, updated_at = ?
            WHERE id = ?`,
        )
        .run(new Date().toISOString(), subscriptionId);

      await db
        .prepare("DELETE FROM subscription_holds WHERE subscription_id = ?")
        .run(subscriptionId);
    })
    .immediate();

  return getSubscriptionSummary(db, subscriptionId);
}
