import { db, nowIso } from "@/lib/db";
import {
  isCreditWorthyStatus,
  isFinalFailStatus,
  parseIpnPayment,
  readNowpaymentsConfig,
  verifyIpnSignature,
} from "@/lib/nowpayments";
import {
  claimPaymentEvent,
  completePaymentEvent,
  failPaymentEvent,
  quarantinePaymentEvent,
} from "@/lib/payment-events";
import { redactSecrets } from "@/lib/redaction";
import { readBoundedText, requestBodyError } from "@/lib/request-limits";
import { fulfillTopup, getTopupById, markTopupFailed } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function eventId(paymentId: string) {
  return `np_${paymentId}`;
}

function expectedAmountMicros(priceAmount: number) {
  // IPN amounts are decimal currency; the store compares exact micro-dollars.
  return Math.round(priceAmount * 100) * 10_000;
}

export async function POST(request: Request) {
  const config = readNowpaymentsConfig();

  if (!config.configured) {
    return Response.json(
      { error: "NOWPayments is not configured." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("x-nowpayments-sig");

  if (!signature) {
    return Response.json(
      { error: "Missing x-nowpayments-sig header." },
      { status: 400 },
    );
  }

  let payload: string;

  try {
    payload = await readBoundedText(request, 1024 * 1024);
  } catch (error) {
    return requestBodyError(error);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Invalid IPN payload." }, { status: 400 });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return Response.json({ error: "Invalid IPN payload." }, { status: 400 });
  }

  if (!verifyIpnSignature(payload, signature, config.ipnSecret)) {
    // A forged or corrupted delivery must not reach any store write.
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  const payment = parseIpnPayment(parsed as Record<string, unknown>);

  if (!payment) {
    return Response.json(
      { error: "IPN payload is missing required fields." },
      { status: 400 },
    );
  }

  if (isFinalFailStatus(payment.paymentStatus)) {
    // Terminal without credit. The idempotent failure mark releases the
    // pending top-up; nothing later can revive this payment into credit.
    markTopupFailed(payment.orderId);

    return Response.json({
      received: true,
      credited: false,
      status: payment.paymentStatus,
    });
  }

  if (!isCreditWorthyStatus(payment.paymentStatus)) {
    // Not settled yet (waiting, confirming, ...) or a status this gateway
    // does not know. NOWPayments delivers again on the next status, so no
    // claim is taken: a claim here would block the later `finished` delivery
    // that must still claim and credit.
    return Response.json({ received: true });
  }

  const claim = claimPaymentEvent(db, {
    id: eventId(payment.paymentId),
    type: "nowpayments_payment",
    livemode: null,
    expectedLivemode: null,
    now: Date.now(),
  });

  if (!claim.ok) {
    // A recent claim is in flight, a decided event is terminal, and a mode
    // mismatch is quarantined: none of them may reach the financial writer.
    return Response.json({
      received: true,
      replay: claim.reason !== "environment_mismatch",
      state: claim.reason,
    });
  }

  try {
    const topup = getTopupById(payment.orderId);

    if (!topup) {
      quarantinePaymentEvent(
        db,
        eventId(payment.paymentId),
        `Unknown order ${payment.orderId}; no credit was issued.`,
      );

      return Response.json({
        received: true,
        credited: false,
        quarantined: true,
      });
    }

    const result = fulfillTopup({
      topupId: topup.id,
      providerRef: eventId(payment.paymentId),
      expectedAmountMicros: expectedAmountMicros(payment.priceAmount),
      expectedCurrency: payment.priceCurrency,
      expectedUserId: topup.userId,
    });

    if (result === "mismatch" || result === "missing") {
      quarantinePaymentEvent(
        db,
        eventId(payment.paymentId),
        `IPN top-up ${result}; no credit was issued.`,
      );

      return Response.json({
        received: true,
        credited: false,
        quarantined: true,
        topup: result,
      });
    }

    completePaymentEvent(db, eventId(payment.paymentId), nowIso());

    return Response.json({
      received: true,
      credited: result === "paid",
    });
  } catch (error) {
    // Keep the claim with a failed state so an operator can see it and a
    // NOWPayments retry can reclaim it; never delete the evidence.
    failPaymentEvent(
      db,
      eventId(payment.paymentId),
      error instanceof Error ? error.message : "unknown",
    );
    // eslint-disable-next-line no-console
    console.error("NOWPayments IPN failed", {
      paymentId: payment.paymentId,
      error: redactSecrets(error instanceof Error ? error.message : "unknown"),
    });

    return Response.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
