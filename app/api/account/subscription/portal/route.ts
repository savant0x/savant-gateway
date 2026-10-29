import {
  customerError,
  NO_STORE,
  requireCustomerApi,
} from "@/lib/customer-auth";
import { resolveAppOrigin, readStripeConfig } from "@/lib/stripe";
import { createBillingPortalUrl } from "@/lib/stripe-subscriptions";
import { customerSubscriptionSummary } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  const config = readStripeConfig();

  if (!config.configured) {
    return customerError(503, config.reason, {
      "X-Reason": "stripe_unconfigured",
    });
  }

  const origin = resolveAppOrigin(request.url);

  if (!origin) return customerError(503, "Set NEXT_PUBLIC_SITE_URL first.");

  const subscription = customerSubscriptionSummary(customer.id);

  if (!subscription?.stripeCustomerId) {
    return customerError(409, "Manual subscriptions have no billing portal.", {
      "X-Reason": "manual_subscription",
    });
  }

  try {
    const url = await createBillingPortalUrl({
      stripeCustomerId: subscription.stripeCustomerId,
      origin,
    });

    return Response.json({ url }, { headers: NO_STORE });
  } catch {
    return customerError(502, "Could not open the billing portal.");
  }
}
