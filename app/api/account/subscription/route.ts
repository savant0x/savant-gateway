import {
  customerError,
  NO_STORE,
  requireCustomerApi,
} from "@/lib/customer-auth";
import { subscriptionLimiter } from "@/lib/customer-rate-limit";
import { readPlanSalesPolicy } from "@/lib/plan-sales";
import { resolveAppOrigin, readStripeConfig } from "@/lib/stripe";
import {
  createPlanCheckout,
  ensureStripeCustomer,
} from "@/lib/stripe-subscriptions";
import {
  createStripeCheckoutSubscription,
  customerSubscriptionSummary,
  getPlanBySlug,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  return Response.json(
    { subscription: customerSubscriptionSummary(customer.id) },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  const decision = subscriptionLimiter.check(customer.id);

  if (!decision.allowed) {
    return customerError(
      429,
      `Too many subscription attempts. Retry in ${decision.retryAfterSeconds}s.`,
      { "Retry-After": String(decision.retryAfterSeconds) },
    );
  }

  // The launch decision outranks payment readiness: configured prepaid Stripe
  // credentials must never make a plan purchasable on their own.
  const sales = readPlanSalesPolicy();

  if (!sales.selling) {
    return customerError(403, sales.reason, {
      "X-Reason": "plan_sales_disabled",
    });
  }

  const config = readStripeConfig();

  if (!config.configured) {
    return customerError(503, config.reason, {
      "X-Reason": "stripe_unconfigured",
    });
  }

  const origin = resolveAppOrigin(request.url);

  if (!origin) {
    return customerError(
      503,
      "Set NEXT_PUBLIC_SITE_URL to the public site origin before selling plans.",
    );
  }

  let body: { planSlug?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return customerError(400, "Invalid JSON body.");
  }

  const planSlug =
    typeof body.planSlug === "string" ? body.planSlug.trim() : "";
  const plan = planSlug ? getPlanBySlug(planSlug) : null;

  if (!plan || plan.status !== "active") {
    return customerError(404, "Plan not found.");
  }

  subscriptionLimiter.fail(customer.id);

  const local = createStripeCheckoutSubscription({
    userId: customer.id,
    plan,
  });

  if (!local.ok) return customerError(local.status, local.error);

  try {
    const stripeCustomerId = await ensureStripeCustomer(customer);
    const session = await createPlanCheckout({
      origin,
      stripeCustomerId,
      localSubscriptionId: local.subscription.id,
      plan,
    });

    if (!session.url) {
      return customerError(502, "Stripe did not return a checkout URL.");
    }

    return Response.json(
      { url: session.url, subscriptionId: local.subscription.id },
      { headers: NO_STORE },
    );
  } catch {
    return customerError(
      502,
      "Could not start subscription checkout. Try again.",
    );
  }
}
