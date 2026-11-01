import {
  customerError,
  NO_STORE,
  requireCustomerApi,
} from "@/lib/customer-auth";
import { promoLimiter } from "@/lib/customer-rate-limit";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { redeemPromoCode } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID = "Promo code is invalid or unavailable.";

export async function POST(request: Request) {
  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  const decision = promoLimiter.check(customer.id);

  if (!decision.allowed) {
    return customerError(
      429,
      `Too many promo attempts. Retry in ${decision.retryAfterSeconds}s.`,
      { "Retry-After": String(decision.retryAfterSeconds) },
    );
  }

  let body: { code?: unknown };

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  if (typeof body.code !== "string" || !body.code.trim()) {
    promoLimiter.fail(customer.id);

    return customerError(400, "Enter a promo code.");
  }

  const result = await redeemPromoCode({
    userId: customer.id,
    code: body.code,
  });

  if (!result.ok) {
    if (result.reason === "disabled") {
      return customerError(503, "Promo redemption is not open yet.");
    }

    if (result.reason === "already_redeemed") {
      return customerError(
        409,
        "This code was already redeemed on this account.",
      );
    }

    promoLimiter.fail(customer.id);

    return customerError(400, INVALID);
  }

  promoLimiter.reset(customer.id);

  return Response.json(
    {
      ok: true,
      amountMicros: result.amountMicros,
      promoId: result.promoId,
    },
    { headers: NO_STORE },
  );
}
