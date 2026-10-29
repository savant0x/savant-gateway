import "server-only";

import type { PlanSummary } from "./types";

import { db } from "./db";
import { readStripeSubscriptionSnapshot } from "./plan-lifecycle";
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
  // Exact whole cents or nothing: rounding here would charge a price the plan
  // page never showed.
  const cents = input.plan.priceMicros / 10_000;

  if (!Number.isInteger(cents)) {
    throw new Error("Plan price must be a whole number of cents.");
  }

  const amount = cents;

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

export async function fetchStripeSubscription(stripeId: string) {
  const subscription = await client().subscriptions.retrieve(stripeId);

  return readStripeSubscriptionSnapshot(subscription);
}
