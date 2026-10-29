import type Stripe from "stripe";

import { readStripeConfig, stripeClient } from "@/lib/stripe";
import { fulfillTopup } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

export async function POST(request: Request) {
  const config = readStripeConfig();

  if (!config.configured) {
    return Response.json(
      { error: "Stripe is not configured." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json(
      { error: "Missing stripe-signature header." },
      { status: 400 },
    );
  }

  const payload = await request.text();

  let event: Stripe.Event;

  try {
    event = stripeClient(config.secretKey).webhooks.constructEvent(
      payload,
      signature,
      config.webhookSecret,
    );
  } catch {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    return Response.json({ received: true, ignored: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const topupId = session.metadata?.topupId;
  const userId = session.metadata?.userId;

  if (!topupId || !userId) {
    return Response.json({ received: true, ignored: true });
  }

  if (session.payment_status !== "paid") {
    return Response.json({ received: true, ignored: true });
  }

  if (session.amount_total == null) {
    return Response.json({ received: true, ignored: true });
  }

  const result = fulfillTopup({
    topupId,
    providerRef: session.id,
    paidAt: new Date(event.created * 1000).toISOString(),
    expectedAmountMicros: session.amount_total * 10_000,
    expectedCurrency: session.currency ?? "usd",
  });

  if (result === "missing") {
    // Signed event for a top-up we do not have, or an amount mismatch.
    // eslint-disable-next-line no-console
    console.error("Stripe fulfillment skipped", {
      topupId,
      eventId: event.id,
      eventType: event.type,
    });
  }

  return Response.json({ received: true, credited: result === "paid" });
}
