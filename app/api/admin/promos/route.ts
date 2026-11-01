import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { sanitizeError } from "@/lib/http";
import { readPriceInput } from "@/lib/pricing";
import {
  MAX_PROMO_MICROS,
  promoAmountProblem,
  promoRedemptionProblem,
  promoWindowProblem,
  readPromoInstant,
  readPromoPolicy,
} from "@/lib/promo-codes";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { createPromoCode, listPromoCodes } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREATE_ERRORS: Record<string, string> = {
  invalid_amount: `amountUsd must be positive and no more than $${MAX_PROMO_MICROS / 1_000_000}.`,
  invalid_redemptions: "maxRedemptions must be a whole number from 1 to 10000.",
  invalid_window: "The promo window is not valid.",
  invalid_code: "A manual code must be 12 letters or digits from A-Z and 2-9.",
  code_exists: "That code already exists.",
  generation_failed: "Could not generate a unique code. Retry.",
};

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const policy = readPromoPolicy();

  return Response.json(
    {
      enabled: policy.enabled,
      reason: policy.reason,
      codes: await listPromoCodes(),
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: {
    amountUsd?: unknown;
    maxRedemptions?: unknown;
    label?: unknown;
    code?: unknown;
    startsAt?: unknown;
    expiresAt?: unknown;
  };

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const amountMicros = readPriceInput(body.amountUsd);

  if (amountMicros === null || amountMicros <= 0) {
    return adminError(400, "amountUsd must be a positive dollar amount.");
  }

  const amountProblem = promoAmountProblem(amountMicros);

  if (amountProblem) return adminError(400, amountProblem);

  const maxRedemptions = body.maxRedemptions ?? 1;

  if (typeof maxRedemptions !== "number") {
    return adminError(400, "maxRedemptions must be a number.");
  }

  const redemptionProblem = promoRedemptionProblem(maxRedemptions);

  if (redemptionProblem) return adminError(400, redemptionProblem);

  const starts = readPromoInstant(body.startsAt);
  const expires = readPromoInstant(body.expiresAt);

  if (!starts.ok) return adminError(400, "startsAt must be a valid date.");
  if (!expires.ok) return adminError(400, "expiresAt must be a valid date.");

  const windowProblem = promoWindowProblem(starts.value, expires.value);

  if (windowProblem) return adminError(400, windowProblem);

  const label = typeof body.label === "string" ? body.label : undefined;
  const code = typeof body.code === "string" ? body.code : undefined;

  try {
    const created = await createPromoCode({
      amountMicros,
      maxRedemptions,
      label,
      code,
      startsAt: starts.value,
      expiresAt: expires.value,
    });

    if (!created.ok) {
      const status = created.error === "generation_failed" ? 500 : 400;

      return adminError(status, CREATE_ERRORS[created.error]);
    }

    return Response.json(created, { status: 201, headers: NO_STORE });
  } catch (error) {
    return adminError(
      500,
      sanitizeError(
        "admin.promos.create",
        error,
        "Could not create the promo.",
      ),
    );
  }
}
