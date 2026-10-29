import {
  customerError,
  NO_STORE,
  requireCustomerApi,
} from "@/lib/customer-auth";
import { topupLimiter } from "@/lib/customer-rate-limit";
import { resolveAppOrigin, readStripeConfig, stripeClient } from "@/lib/stripe";
import { createTopup, markTopupFailed, setTopupProviderRef } from "@/lib/store";
import { parseTopupAmount } from "@/lib/topup-amount";

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
    body = (await request.json()) as typeof body;
  } catch {
    return customerError(400, "Invalid JSON body.");
  }

  const amount = parseTopupAmount(body.amountUsd);

  if (!amount.ok) return customerError(400, amount.error);

  topupLimiter.fail(customer.id);

  const topup = createTopup({
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
      markTopupFailed(topup.id);

      return customerError(502, "Stripe did not return a checkout URL.");
    }

    setTopupProviderRef(topup.id, session.id);

    return Response.json(
      { url: session.url, topupId: topup.id },
      { headers: NO_STORE },
    );
  } catch {
    markTopupFailed(topup.id);

    return customerError(502, "Could not start checkout. Try again.");
  }
}
