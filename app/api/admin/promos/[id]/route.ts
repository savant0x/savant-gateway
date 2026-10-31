import type { PromoStatus } from "@/lib/promo-codes";

import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { setPromoCodeStatus } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: PromoStatus[] = ["active", "paused", "archived"];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: { status?: unknown };

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  if (
    typeof body.status !== "string" ||
    !STATUSES.includes(body.status as PromoStatus)
  ) {
    return adminError(400, "status must be active, paused, or archived.");
  }

  const { id } = await context.params;
  const result = setPromoCodeStatus(id, body.status as PromoStatus);

  if (result === "missing") return adminError(404, "Promo code not found.");

  return Response.json(
    { ok: true, changed: result === "updated" },
    {
      headers: NO_STORE,
    },
  );
}
