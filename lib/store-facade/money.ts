import * as planRows from "../storage/store/plan-rows.ts";
import * as plans from "../storage/store/plans.ts";
import * as promos from "../storage/store/promos.ts";
import * as reconciliation from "../storage/store/reconciliation.ts";
import * as settlements from "../storage/store/settlements.ts";
import * as subscriptionAccess from "../storage/store/subscription-access.ts";
import * as subscriptionAdmin from "../storage/store/subscription-admin.ts";
import * as subscriptionInvoices from "../storage/store/subscription-invoices.ts";
import * as subscriptionLifecycle from "../storage/store/subscription-lifecycle.ts";
import * as subscriptionRows from "../storage/store/subscription-rows.ts";
import * as subscriptions from "../storage/store/subscriptions.ts";
import * as topups from "../storage/store/topups.ts";

import { bound } from "./bound.ts";

/**
 * Money façade (FID-086, step 4): plans, subscriptions, top-ups, promos,
 * settlements and reconciliation.
 *
 * Every function here moves or explains customer money, so the wrappers add no
 * behavior of their own — no defaults, no coercion, no retries. The one thing
 * this module decides is *which* ported function answers a legacy name, and it
 * keeps that to names that are identical in shape. Where the port split a file
 * (subscriptions into lifecycle, rows, invoices, entitlements), the old call
 * sites keep working because the exported names are the ones they already used.
 */

export const createPlan = bound(plans.createPlan);
export const updatePlan = bound(plans.updatePlan);
export const deletePlan = bound(plans.deletePlan);
export const planHasSubscriptions = bound(plans.planHasSubscriptions);

export const listPlans = bound(planRows.listPlans);
export const listActivePlans = bound(planRows.listActivePlans);
export const listSellablePlans = bound(planRows.listSellablePlans);
export const getPlanById = bound(planRows.getPlanById);
export const getPlanBySlug = bound(planRows.getPlanBySlug);

export const createTopup = bound(topups.createTopup);
export const setTopupProviderRef = bound(topups.setTopupProviderRef);
export const markTopupFailed = bound(topups.markTopupFailed);
export const fulfillTopup = bound(topups.fulfillTopup);
export const getTopupById = bound(topups.getTopupById);
export const listTopups = bound(topups.listTopups);
export const listCustomerTopups = bound(topups.listCustomerTopups);
export const getCustomerPurchasedMicros = bound(
  topups.getCustomerPurchasedMicros,
);

export const createPromoCode = bound(promos.createPromoCode);
export const listPromoCodes = bound(promos.listPromoCodes);
export const setPromoCodeStatus = bound(promos.setPromoCodeStatus);
export const redeemPromoCode = bound(promos.redeemPromoCode);

export const openCallSettlement = bound(settlements.openCallSettlement);
export const listSettlementState = bound(settlements.listSettlementState);
export const releaseQuarantined = bound(settlements.releaseQuarantined);

export const getReconciliation = bound(reconciliation.getReconciliation);
export const adjustCredit = bound(reconciliation.adjustCredit);
export const saveBaseline = bound(reconciliation.saveBaseline);
export const listBalanceBaselines = bound(reconciliation.listBalanceBaselines);

export const createStripeCheckoutSubscription = bound(
  subscriptions.createStripeCheckoutSubscription,
);
export const attachStripeCheckout = bound(
  subscriptionLifecycle.attachStripeCheckout,
);
export const findSubscriptionIdByStripeId = bound(
  subscriptionLifecycle.findSubscriptionIdByStripeId,
);
export const findSubscriptionIdByStripeCustomer = bound(
  subscriptionLifecycle.findSubscriptionIdByStripeCustomer,
);
export const activateSubscription = bound(
  subscriptionLifecycle.activateSubscription,
);
export const markSubscriptionPastDue = bound(
  subscriptionLifecycle.markSubscriptionPastDue,
);
export const reconcileStripeSubscription = bound(
  subscriptionLifecycle.reconcileStripeSubscription,
);
export const setSubscriptionCancellation = bound(
  subscriptionLifecycle.setSubscriptionCancellation,
);
export const revokeSubscription = bound(
  subscriptionLifecycle.revokeSubscription,
);

export const recordSubscriptionInvoice = bound(
  subscriptionInvoices.recordSubscriptionInvoice,
);

export const getSubscriptionSummary = bound(
  subscriptionRows.getSubscriptionSummary,
);
export const listSubscriptionSummaries = bound(
  subscriptionRows.listSubscriptionSummaries,
);
export const customerSubscriptionSummary = bound(
  subscriptionRows.customerSubscriptionSummary,
);

export const resolveSubscriptionAccess = bound(
  subscriptionAccess.resolveSubscriptionAccess,
);
export const sweepSubscriptions = bound(subscriptionAccess.sweepSubscriptions);

export const grantManualSubscription = bound(
  subscriptionAdmin.grantManualSubscription,
);
export const extendSubscription = bound(subscriptionAdmin.extendSubscription);
export const refreshSubscriptionEntitlements = bound(
  subscriptionAdmin.refreshSubscriptionEntitlements,
);
