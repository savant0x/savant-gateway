import "server-only";

import type Stripe from "stripe";
import type { PlanSummary } from "./types";

import { db } from "./db";
import { readStripeConfig, stripeClient } from "./stripe";

type Env = Readonly<Record<string, string | undefined>>;

function client(env: Env = process.env) {
  const config = readStripeConfig(env);

  if (!config.configured) {
    throw new Error("Stripe is not configured.");
  }

  return stripeClient(config.secretKey);
}

export async function ensureStripeCustomer(
  input: { id: string; email: string; name: string },
  env: Env = process.env,
) {
  const existing = db
    .prepare("SELECT stripe_customer_id FROM users WHERE id = ?")
    .get(input.id) as { stripe_customer_id: string | null } | undefined;

  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const created = await client(env).customers.create({
    email: input.email,
    name: input.name,
    metadata: { userId: input.id },
  });

  db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(
    created.id,
    input.id,
  );

  return created.id;
}

export async function createPlanCheckout(input: {
  origin: string;
  stripeCustomerId: string;
  localSubscriptionId: string;
  plan: PlanSummary;
}) {
  const amount = Math.round(input.plan.priceMicros / 10_000);

  if (amount < 50) {
    throw new Error("Active plans must cost at least $0.50.");
  }

  return client().checkout.sessions.create({
    mode: "subscription",
    customer: input.stripeCustomerId,
    client_reference_id: input.localSubscriptionId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.plan.currency,
          unit_amount: amount,
          recurring: { interval: input.plan.interval },
          product_data: {
            name: `${input.plan.name} subscription`,
            description: input.plan.description ?? undefined,
          },
        },
      },
    ],
    metadata: {
      subscriptionId: input.localSubscriptionId,
      planId: input.plan.id,
    },
    subscription_data: {
      metadata: {
        subscriptionId: input.localSubscriptionId,
        planId: input.plan.id,
      },
    },
    success_url: `${input.origin}/account?subscription=success`,
    cancel_url: `${input.origin}/account?subscription=cancelled`,
    allow_promotion_codes: false,
  });
}

export async function createBillingPortalUrl(input: {
  stripeCustomerId: string;
  origin: string;
}) {
  const session = await client().billingPortal.sessions.create({
    customer: input.stripeCustomerId,
    return_url: `${input.origin}/account`,
  });

  return session.url;
}

export async function cancelStripeSubscriptionNow(stripeId: string) {
  try {
    await client().subscriptions.cancel(stripeId);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "resource_missing"
    ) {
      return;
    }

    throw error;
  }
}

export async function setStripeCancellation(
  stripeId: string,
  cancelAtPeriodEnd: boolean,
) {
  return client().subscriptions.update(stripeId, {
    cancel_at_period_end: cancelAtPeriodEnd,
  });
}

function epoch(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? new Date(value * 1000).toISOString()
    : null;
}

export type StripeSubscriptionSnapshot = {
  status: string;
  stripeCustomerId: string;
  periodStart: string;
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
};

/** Reads period fields from either the subscription or its first item. */
export function readStripeSubscriptionSnapshot(
  subscription: Stripe.Subscription,
  now = Date.now(),
): StripeSubscriptionSnapshot {
  const raw = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
    cancel_at_period_end?: boolean;
    status?: string;
    customer?: string | { id: string };
    items?: {
      data?: Array<{
        current_period_start?: number;
        current_period_end?: number;
      }>;
    };
  };
  const item = raw.items?.data?.[0];
  const periodStart =
    epoch(raw.current_period_start) ??
    epoch(item?.current_period_start) ??
    new Date(now).toISOString();
  const periodEnd =
    epoch(raw.current_period_end) ??
    epoch(item?.current_period_end) ??
    new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  const customer =
    typeof raw.customer === "string" ? raw.customer : (raw.customer?.id ?? "");

  return {
    status: raw.status ?? subscription.status,
    stripeCustomerId: customer,
    periodStart,
    periodEnd,
    cancelAtPeriodEnd: raw.cancel_at_period_end === true,
  };
}

export async function fetchStripeSubscription(stripeId: string) {
  const subscription = await client().subscriptions.retrieve(stripeId);

  return readStripeSubscriptionSnapshot(subscription);
}
