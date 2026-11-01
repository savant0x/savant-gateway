import type { PostgresDatabase } from "../pg-adapter.ts";
import type { PlanSummary, SubscriptionSummary } from "../../types.ts";

import { randomUUID } from "node:crypto";

import { intervalEndIso } from "../../plan-lifecycle.ts";

import {
  expireIncompleteForUser,
  insertEntitlements,
} from "./subscription-entitlements.ts";
import {
  activeSubscriptionRow,
  getSubscriptionSummary,
} from "./subscription-rows.ts";
import {
  openSubscriptionPeriod,
  sweepSubscriptions,
} from "./subscription-access.ts";

/**
 * Subscription checkout entry point, ported to the async handle (FID-086
 * Batch A).
 *
 * The lifecycle that follows the checkout — attach, activate, reconcile,
 * cancel, revoke — lives in `./subscription-lifecycle.ts` and is re-exported
 * here, so `lib/store/subscriptions.ts` can stay the one import path after the
 * flip without this module growing past the file ceiling.
 *
 * A checkout row is created `incomplete` and gets no entitlement of its own
 * until a signed invoice is paid. The period is opened immediately so the plan's
 * allowance has a period to attach to; it is closed by `expireIncompleteForUser`
 * if the checkout is abandoned.
 */

export type SubscriptionMutation =
  | { ok: true; subscription: SubscriptionSummary }
  | { ok: false; status: 400 | 404 | 409; error: string };

export {
  customerSubscriptionSummary,
  listSubscriptionSummaries,
} from "./subscription-rows.ts";
export { getSubscriptionSummary };
export { sweepSubscriptions } from "./subscription-access.ts";
export {
  activateSubscription,
  attachStripeCheckout,
  findSubscriptionIdByStripeCustomer,
  findSubscriptionIdByStripeId,
  markSubscriptionPastDue,
  reconcileStripeSubscription,
  revokeSubscription,
  setSubscriptionCancellation,
} from "./subscription-lifecycle.ts";
export {
  recordSubscriptionInvoice,
  type InvoiceInput,
} from "./subscription-invoices.ts";

export async function createStripeCheckoutSubscription(
  db: PostgresDatabase,
  input: { userId: string; plan: PlanSummary },
): Promise<SubscriptionMutation> {
  await sweepSubscriptions(db);

  if (await activeSubscriptionRow(db, input.userId)) {
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

  const user = await db
    .prepare("SELECT id FROM users WHERE id = ? AND password_hash IS NOT NULL")
    .get<{ id: string }>(input.userId);

  if (!user) {
    return { ok: false, status: 404, error: "Customer not found." };
  }

  const now = new Date().toISOString();
  const id = `sub_${randomUUID()}`;
  const periodEnd = intervalEndIso(now, input.plan.interval);

  await db
    .transaction(async () => {
      await expireIncompleteForUser(db, input.userId);

      await db
        .prepare(
          `INSERT INTO subscriptions
            (id, user_id, plan_id, status, source, stripe_customer_id,
             stripe_subscription_id, plan_name_snapshot, price_micros_snapshot,
             currency_snapshot, interval_snapshot,
             included_weighted_tokens_snapshot, overage_mode_snapshot,
             overage_markup_bps_snapshot, current_period_start,
             current_period_end, cancel_at_period_end, created_at, updated_at)
           VALUES (?, ?, ?, 'incomplete', 'stripe', NULL, NULL, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .run(
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

      await insertEntitlements(db, id, input.plan.modelIds);
      await openSubscriptionPeriod(db, {
        subscriptionId: id,
        start: now,
        end: periodEnd,
        includedWeightedTokens: input.plan.includedWeightedTokens,
      });
    })
    .immediate();

  return { ok: true, subscription: (await getSubscriptionSummary(db, id))! };
}
