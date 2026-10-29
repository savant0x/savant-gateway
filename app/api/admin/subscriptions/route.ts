import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import {
  fetchStripeSubscription,
  cancelStripeSubscriptionNow,
} from "@/lib/stripe-subscriptions";
import {
  extendSubscription,
  getSubscriptionSummary,
  grantManualSubscription,
  listSubscriptionSummaries,
  reconcileStripeSubscription,
  refreshSubscriptionEntitlements,
  revokeSubscription,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stringField(body: Record<string, unknown>, key: string) {
  const value = body[key];

  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  return Response.json(
    { subscriptions: listSubscriptionSummaries(200) },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  const action = stringField(body, "action");

  if (action === "grant") {
    const result = grantManualSubscription({
      userId: stringField(body, "userId"),
      planId: stringField(body, "planId"),
      periodEnd: stringField(body, "periodEnd") || null,
    });

    if (!result.ok) return adminError(result.status, result.error);

    return Response.json(
      { ok: true, subscription: result.subscription },
      { headers: NO_STORE },
    );
  }

  const id = stringField(body, "id");

  if (!id) return adminError(400, "A subscription id is required.");

  const current = getSubscriptionSummary(id);

  if (!current) return adminError(404, "Subscription not found.");

  if (action === "extend") {
    const result = extendSubscription({
      subscriptionId: id,
      periodEnd: stringField(body, "periodEnd") || null,
    });

    if (!result.ok) return adminError(result.status, result.error);

    return Response.json(
      { ok: true, subscription: result.subscription },
      { headers: NO_STORE },
    );
  }

  if (action === "refresh_entitlements") {
    const result = refreshSubscriptionEntitlements(id);

    if (!result.ok) return adminError(result.status, result.error);

    return Response.json(
      { ok: true, subscription: result.subscription },
      { headers: NO_STORE },
    );
  }

  if (action === "revoke") {
    if (current.stripeSubscriptionId) {
      try {
        await cancelStripeSubscriptionNow(current.stripeSubscriptionId);
      } catch {
        return adminError(502, "Stripe could not cancel the subscription.");
      }
    }

    const subscription = revokeSubscription(id);

    return Response.json({ ok: true, subscription }, { headers: NO_STORE });
  }

  if (action === "sync") {
    if (!current.stripeSubscriptionId) {
      return adminError(
        409,
        "Manual subscriptions cannot be synced from Stripe.",
      );
    }

    try {
      const snapshot = await fetchStripeSubscription(
        current.stripeSubscriptionId,
      );
      const subscription = reconcileStripeSubscription({
        stripeSubscriptionId: current.stripeSubscriptionId,
        stripeCustomerId:
          snapshot.stripeCustomerId || current.stripeCustomerId || "",
        status: snapshot.status,
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      });

      return Response.json({ ok: true, subscription }, { headers: NO_STORE });
    } catch {
      return adminError(
        502,
        "Stripe could not be reached for this subscription.",
      );
    }
  }

  return adminError(400, "Unknown subscription action.");
}
