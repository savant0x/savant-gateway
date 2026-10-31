import {
  customerError,
  NO_STORE,
  requireCustomerApi,
} from "@/lib/customer-auth";
import { topupLimiter } from "@/lib/customer-rate-limit";
import {
  createNowpaymentsInvoice,
  readNowpaymentsConfig,
  readNowpaymentsPolicy,
} from "@/lib/nowpayments";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { createTopup, markTopupFailed, setTopupProviderRef } from "@/lib/store";
import { resolveAppOrigin } from "@/lib/stripe";
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

  const nowpayments = readNowpaymentsPolicy();

  if (!nowpayments.enabled) {
    return customerError(503, nowpayments.reason, {
      "X-Reason": "crypto_topups_disabled",
    });
  }

  const config = readNowpaymentsConfig();

  if (!config.configured) {
    return customerError(503, config.reason, {
      "X-Reason": "nowpayments_unconfigured",
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

  const topup = createTopup({
    userId: customer.id,
    amountMicros: amount.amountMicros,
    provider: "nowpayments",
  });

  try {
    const invoice = await createNowpaymentsInvoice({
      apiKey: config.apiKey,
      amountMicros: amount.amountMicros,
      orderId: topup.id,
      ipnCallbackUrl: `${origin}/api/webhooks/nowpayments`,
      successUrl: `${origin}/account?topup=success`,
      cancelUrl: `${origin}/account?topup=cancelled`,
    });

    setTopupProviderRef(topup.id, invoice.id);

    return Response.json(
      { url: invoice.invoiceUrl, topupId: topup.id },
      { headers: NO_STORE },
    );
  } catch {
    markTopupFailed(topup.id);

    return customerError(502, "Could not start checkout. Try again.");
  }
}
