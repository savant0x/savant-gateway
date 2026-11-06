import type Stripe from "stripe";

import {
  readStripeConfig,
  readStripeExpectedLivemode,
  stripeClient,
} from "@/lib/stripe";
import {
  claimPaymentEvent,
  failPaymentEvent,
  processPaymentEvent,
} from "@/lib/storage/ledger/payment-events";
import { storeRuntime } from "@/lib/store-facade/runtime";
import { redactSecrets } from "@/lib/redaction";
import { readBoundedText, requestBodyError } from "@/lib/request-limits";
import { handleStripeEvent } from "@/lib/stripe-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let payload: string;

  try {
    payload = await readBoundedText(request, 1024 * 1024);
  } catch (error) {
    return requestBodyError(error);
  }

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

  const db = await storeRuntime();
  const claim = await claimPaymentEvent(db, {
    id: event.id,
    type: event.type,
    livemode: typeof event.livemode === "boolean" ? event.livemode : null,
    expectedLivemode: readStripeExpectedLivemode(),
    now: Date.now(),
  });

  if (!claim.ok) {
    // A recent claim is in flight; retrying before the grace window cannot
    // help. Decided events remain acknowledged as terminal replays.
    if (claim.reason === "in_flight") {
      return Response.json(
        { error: "Webhook is already in flight.", state: claim.reason },
        { status: 409, headers: { "Retry-After": "30" } },
      );
    }

    return Response.json({
      received: true,
      replay: true,
      state: claim.reason,
    });
  }

  try {
    const outcome = await processPaymentEvent(
      db,
      { id: event.id, generation: claim.generation },
      async () => {
        const result = await handleStripeEvent(event);
        const topup = "topup" in result ? result.topup : null;

        if (topup === "mismatch" || topup === "missing") {
          return {
            value: result,
            quarantine: `Checkout top-up ${topup}; no credit was issued.`,
          };
        }

        return { value: result };
      },
    );

    if (!outcome.ok) {
      return Response.json(
        { error: "Webhook ownership was lost.", state: outcome.reason },
        { status: 409, headers: { "Retry-After": "30" } },
      );
    }

    const result = outcome.value;
    const topup = "topup" in result ? result.topup : null;

    if (outcome.quarantined) {
      return Response.json({
        received: true,
        credited: false,
        quarantined: true,
        topup,
      });
    }

    return Response.json({
      received: true,
      ...(topup === null ? {} : { credited: topup === "paid" }),
      ...result,
    });
  } catch (error) {
    // The effect transaction rolled back. Keep a failed claim with the same
    // generation so a retry can reclaim it; a stale owner cannot flip it.
    const failed = await failPaymentEvent(
      db,
      event.id,
      claim.generation,
      error instanceof Error ? error.message : "unknown",
    ).catch(() => false);

    // eslint-disable-next-line no-console
    console.error("Stripe webhook failed", {
      eventId: event.id,
      eventType: event.type,
      error: redactSecrets(error instanceof Error ? error.message : "unknown"),
    });

    if (!failed) {
      return Response.json(
        { error: "Webhook ownership was lost." },
        { status: 409, headers: { "Retry-After": "30" } },
      );
    }

    return Response.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
