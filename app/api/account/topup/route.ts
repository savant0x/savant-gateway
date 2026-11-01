import {
  customerError,
  NO_STORE,
  requireCustomerApi,
} from "@/lib/customer-auth";
import { readCardTopupPolicy } from "@/lib/card-topups";
import { topupLimiter } from "@/lib/customer-rate-limit";
import { resolveAppOrigin, readStripeConfig, stripeClient } from "@/lib/stripe";
import { createTopup, markTopupFailed, setTopupProviderRef } from "@/lib/store";
import { parseTopupAmount } from "@/lib/topup-amount";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  const decision = topupLimiter.check(customer.id);

  if (!decision.allowed) {
    return customerError(
      429,
      `Too many top-up attempts. Retry in ${decision.retryAfterSeconds}s.`,
      { "Retry-After": String(decision.retryAfterSeconds) },
    );
  }

  const cardTopups = readCardTopupPolicy();

  if (!cardTopups.enabled) {
    return customerError(503, cardTopups.reason, {
      "X-Reason": "card_topups_disabled",
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
      "Set NEXT_PUBLIC_SITE_URL to the public site origin before selling credit.",
    );
  }

  let body: { amountUsd?: unknown };

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const amount = parseTopupAmount(body.amountUsd);

  if (!amount.ok) return customerError(400, amount.error);

  topupLimiter.fail(customer.id);

  const topup = await createTopup({
    userId: customer.id,
    amountMicros: amount.amountMicros,
  });

  try {
    const session = await stripeClient(
      config.secretKey,
    ).checkout.sessions.create({
      mode: "payment",
      client_reference_id: topup.id,
      customer_email: customer.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amount.amountCents,
            product_data: {
              name: "Savant Gateway credit",
              description: `$${amount.amountUsd.toFixed(2)} of prepaid gateway credit`,
            },
          },
        },
      ],
      metadata: { topupId: topup.id, userId: customer.id },
      success_url: `${origin}/account?topup=success`,
      cancel_url: `${origin}/account?topup=cancelled`,
    });

    if (!session.url) {
      await markTopupFailed(topup.id);

      return customerError(502, "Stripe did not return a checkout URL.");
    }

    await setTopupProviderRef(topup.id, session.id);

    return Response.json(
      { url: session.url, topupId: topup.id },
      { headers: NO_STORE },
    );
  } catch {
    await markTopupFailed(topup.id);

    return customerError(502, "Could not start checkout. Try again.");
  }
}
