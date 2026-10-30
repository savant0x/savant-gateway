import type Stripe from "stripe";

import {
  intervalEndIso,
  readStripeSubscriptionSnapshot,
} from "@/lib/plan-lifecycle";
import { readStripeConfig, stripeClient } from "@/lib/stripe";
import {
  activateSubscription,
  attachStripeCheckout,
  findSubscriptionIdByStripeId,
  fulfillTopup,
  getSubscriptionSummary,
  markSubscriptionPastDue,
  reconcileStripeSubscription,
} from "@/lib/store";
import { db, nowIso } from "@/lib/db";
import { redactSecrets } from "@/lib/redaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InvoiceLike = {
  id: string;
  amount_paid?: number;
  amount_due?: number;
  currency?: string;
  status?: string;
  status_transitions?: { paid_at?: number };
  subscription?: string | { id?: string };
  customer?: string | { id?: string };
  parent?: {
    subscription_details?: {
      subscription?: string | { id?: string };
      metadata?: Record<string, string>;
    };
  };
  lines?: {
    data?: Array<{
      period?: { start?: number; end?: number };
    }>;
  };
};

function idOf(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;

    return typeof id === "string" ? id : "";
  }

  return "";
}

function metadataOf(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const metadata = (value as { metadata?: unknown }).metadata;

  return metadata && typeof metadata === "object"
    ? (metadata as Record<string, string>)
    : {};
}

function epochIso(value: unknown, fallback: string | null = null) {
  return typeof value === "number" && value > 0
    ? new Date(value * 1000).toISOString()
    : fallback;
}

function invoiceSubscription(invoice: InvoiceLike) {
  return (
    idOf(invoice.subscription) ||
    idOf(invoice.parent?.subscription_details?.subscription)
  );
}

function invoiceMetadata(invoice: InvoiceLike) {
  return invoice.parent?.subscription_details?.metadata ?? {};
}

/** Null when the invoice reports no line period and no stored period exists. */
function invoicePeriod(
  invoice: InvoiceLike,
  fallbackStart: string | null,
  fallbackEnd: string | null,
) {
  const line = invoice.lines?.data?.[0]?.period;
  const start = epochIso(line?.start, fallbackStart);
  const end = epochIso(line?.end, fallbackEnd);

  return start && end ? { start, end } : null;
}

function claimEvent(id: string, type: string) {
  const result = db
    .prepare(
      "INSERT OR IGNORE INTO billing_events (id, type, processed_at) VALUES (?, ?, ?)",
    )
    .run(id, type, nowIso());

  return result.changes > 0;
}

function releaseEvent(id: string) {
  db.prepare("DELETE FROM billing_events WHERE id = ?").run(id);
}

function topupFromSession(
  session: Stripe.Checkout.Session,
  event: Stripe.Event,
) {
  const topupId = session.metadata?.topupId;
  const userId = session.metadata?.userId;

  if (
    !topupId ||
    !userId ||
    session.payment_status !== "paid" ||
    session.amount_total == null
  ) {
    return false;
  }

  const result = fulfillTopup({
    topupId,
    providerRef: session.id,
    paidAt: new Date(event.created * 1000).toISOString(),
    expectedAmountMicros: session.amount_total * 10_000,
    expectedCurrency: session.currency ?? "usd",
  });

  return result === "paid";
}

async function handleEvent(event: Stripe.Event) {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.mode !== "subscription") {
      return { credited: topupFromSession(session, event) };
    }

    const subscriptionId = session.metadata?.subscriptionId;
    const stripeSubscriptionId = idOf(session.subscription);
    const stripeCustomerId = idOf(session.customer);

    if (subscriptionId && stripeSubscriptionId) {
      attachStripeCheckout({
        subscriptionId,
        stripeSubscriptionId,
        stripeCustomerId,
      });
    }

    return { linked: Boolean(subscriptionId && stripeSubscriptionId) };
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const stripeId = subscription.id;
    const metadata = metadataOf(subscription);
    const localId = metadata.subscriptionId ?? "";
    const snapshot = readStripeSubscriptionSnapshot(subscription);

    if (localId && stripeId) {
      attachStripeCheckout({
        subscriptionId: localId,
        stripeSubscriptionId: stripeId,
        stripeCustomerId: snapshot.stripeCustomerId,
      });
    }

    const reconciled = reconcileStripeSubscription({
      stripeSubscriptionId: stripeId,
      stripeCustomerId: snapshot.stripeCustomerId,
      status:
        event.type === "customer.subscription.deleted"
          ? "canceled"
          : snapshot.status,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    });

    return { reconciled: Boolean(reconciled) };
  }

  if (
    event.type === "invoice.paid" ||
    event.type === "invoice.payment_failed"
  ) {
    const invoice = event.data.object as unknown as InvoiceLike;
    const stripeId = invoiceSubscription(invoice);
    const metadata = invoiceMetadata(invoice);
    const stripeCustomerId = idOf(invoice.customer);
    let localId: string | null =
      metadata.subscriptionId ?? findSubscriptionIdByStripeId(stripeId);

    if (!localId && stripeId && stripeCustomerId) {
      const pending = db
        .prepare(
          `SELECT s.id FROM subscriptions s
           JOIN users u ON u.id = s.user_id
           WHERE s.status = 'incomplete'
             AND (s.stripe_customer_id = ? OR u.stripe_customer_id = ?)
           ORDER BY datetime(s.created_at) DESC LIMIT 1`,
        )
        .get(stripeCustomerId, stripeCustomerId) as { id: string } | undefined;

      localId = pending?.id ?? null;

      if (localId) {
        attachStripeCheckout({
          subscriptionId: localId,
          stripeSubscriptionId: stripeId,
          stripeCustomerId,
        });
      }
    }

    if (!localId) return { ignored: "unknown_subscription" };

    const existing = getSubscriptionSummary(localId);
    const paidAt = epochIso(invoice.status_transitions?.paid_at, nowIso());
    const fallbackStart = existing?.currentPeriodStart ?? null;
    const fallbackEnd =
      existing && fallbackStart
        ? intervalEndIso(fallbackStart, existing.plan.interval)
        : null;
    const period = invoicePeriod(invoice, fallbackStart, fallbackEnd);

    if (!period) {
      // No dated line and no stored period: activating here would invent the
      // allowance window. Refuse, release the claim, and let Stripe retry.
      return { ignored: "invoice_period_unavailable" };
    }

    const amount =
      event.type === "invoice.paid"
        ? (invoice.amount_paid ?? 0)
        : (invoice.amount_due ?? 0);
    const invoiceInput = {
      providerInvoiceId: invoice.id,
      amountMicros: Math.max(0, amount) * 10_000,
      currency: invoice.currency ?? "usd",
      status:
        event.type === "invoice.paid" ? ("paid" as const) : ("failed" as const),
      periodStart: period.start,
      periodEnd: period.end,
      paidAt: event.type === "invoice.paid" ? paidAt : null,
    };

    if (event.type === "invoice.payment_failed") {
      const result = markSubscriptionPastDue({
        subscriptionId: localId,
        stripeSubscriptionId: stripeId || null,
        invoice: invoiceInput,
      });

      return { pastDue: Boolean(result) };
    }

    const result = activateSubscription({
      subscriptionId: localId,
      stripeSubscriptionId: stripeId || null,
      stripeCustomerId: stripeCustomerId || null,
      periodStart: period.start,
      periodEnd: period.end,
      invoice: invoiceInput,
    });

    return { activated: Boolean(result) };
  }

  return { ignored: true };
}

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

  if (!claimEvent(event.id, event.type)) {
    return Response.json({ received: true, replay: true });
  }

  try {
    const result = await handleEvent(event);

    return Response.json({ received: true, ...result });
  } catch (error) {
    releaseEvent(event.id);
    // eslint-disable-next-line no-console
    console.error("Stripe webhook failed", {
      eventId: event.id,
      eventType: event.type,
      error: redactSecrets(error instanceof Error ? error.message : "unknown"),
    });

    return Response.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
