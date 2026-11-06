import { storeRuntime } from "@/lib/store-facade/runtime";
import {
  isCreditWorthyStatus,
  isFinalFailStatus,
  parseIpnPayment,
  readNowpaymentsConfig,
  verifyIpnSignature,
} from "@/lib/nowpayments";
import {
  claimPaymentEvent,
  failPaymentEvent,
  processPaymentEvent,
} from "@/lib/storage/ledger/payment-events";
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
    await markTopupFailed(payment.orderId);

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

  const db = await storeRuntime();
  const id = eventId(payment.paymentId);
  const claim = await claimPaymentEvent(db, {
    id,
    type: "nowpayments_payment",
    livemode: null,
    expectedLivemode: null,
    now: Date.now(),
  });

  if (!claim.ok) {
    if (claim.reason === "in_flight") {
      return Response.json(
        { error: "IPN is already in flight.", state: claim.reason },
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
    const outcome = await processPaymentEvent<{
      result: string;
      topup: Awaited<ReturnType<typeof getTopupById>>;
    }>(db, { id, generation: claim.generation }, async () => {
      const topup = await getTopupById(payment.orderId);

      if (!topup) {
        return {
          value: { result: "missing" as const, topup: null },
          quarantine: `Unknown order ${payment.orderId}; no credit was issued.`,
        };
      }

      const result = await fulfillTopup({
        topupId: topup.id,
        providerRef: id,
        expectedAmountMicros: expectedAmountMicros(payment.priceAmount),
        expectedCurrency: payment.priceCurrency,
        expectedUserId: topup.userId,
      });

      if (result === "mismatch" || result === "missing") {
        return {
          value: { result, topup },
          quarantine: `IPN top-up ${result}; no credit was issued.`,
        };
      }

      return { value: { result, topup } };
    });

    if (!outcome.ok) {
      return Response.json(
        { error: "IPN ownership was lost.", state: outcome.reason },
        { status: 409, headers: { "Retry-After": "30" } },
      );
    }

    if (outcome.quarantined) {
      return Response.json({
        received: true,
        credited: false,
        quarantined: true,
        topup: outcome.value.result,
      });
    }

    return Response.json({
      received: true,
      credited: outcome.value.result === "paid",
    });
  } catch (error) {
    // The effect transaction rolled back. Keep a failed claim with the same
    // generation so a retry can reclaim it; a stale owner cannot flip it.
    const failed = await failPaymentEvent(
      db,
      id,
      claim.generation,
      error instanceof Error ? error.message : "unknown",
    ).catch(() => false);

    // eslint-disable-next-line no-console
    console.error("NOWPayments IPN failed", {
      paymentId: payment.paymentId,
      error: redactSecrets(error instanceof Error ? error.message : "unknown"),
    });

    if (!failed) {
      return Response.json(
        { error: "IPN ownership was lost." },
        { status: 409, headers: { "Retry-After": "30" } },
      );
    }

    return Response.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
