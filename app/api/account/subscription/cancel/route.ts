import {
  customerError,
  NO_STORE,
  requireCustomerApi,
} from "@/lib/customer-auth";
import { setStripeCancellation } from "@/lib/stripe-subscriptions";
import {
  customerSubscriptionSummary,
  setSubscriptionCancellation,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  const subscription = customerSubscriptionSummary(customer.id);

  if (
    !subscription ||
    (subscription.status !== "active" && subscription.status !== "past_due")
  ) {
    return customerError(404, "There is no active subscription to cancel.");
  }

  if (subscription.stripeSubscriptionId) {
    try {
      await setStripeCancellation(subscription.stripeSubscriptionId, true);
    } catch {
      return customerError(502, "Stripe could not schedule the cancellation.");
    }
  }

  const updated = setSubscriptionCancellation(subscription.id, true);

  if (!updated) {
    return customerError(409, "The subscription is no longer active.");
  }

  return Response.json({ subscription: updated }, { headers: NO_STORE });
}
