import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { isJsonObject } from "@/lib/http";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { adjustCredit, getReconciliation, listCreditLedger } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Appends one refund or adjustment. A reference names the correction, so a
 * retry returns the original entry instead of crediting again.
 */
export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: unknown;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  if (!isJsonObject(body)) {
    return adminError(400, "Request body must be a JSON object.");
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const reference =
    typeof body.reference === "string" ? body.reference.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const kind = body.kind === "refund" ? "refund" : "adjustment";
  const amountUsd =
    typeof body.amountUsd === "number" ? body.amountUsd : Number.NaN;
  const amountMicros = Math.round(amountUsd * 1_000_000);

  if (!userId) return adminError(400, "userId is required.");
  if (!Number.isSafeInteger(amountMicros) || amountMicros === 0) {
    return adminError(400, "amountUsd must be a nonzero dollar amount.");
  }
  if (kind === "refund" && amountMicros < 0) {
    return adminError(400, "A refund must credit the customer.");
  }

  const result = await adjustCredit({
    userId,
    amountMicros,
    kind,
    reference,
    note,
  });

  if (!result.ok) {
    const status =
      result.reason === "reference_conflict"
        ? 409
        : result.reason === "unknown_user"
          ? 404
          : 400;

    return adminError(status, `Adjustment refused: ${result.reason}.`);
  }

  return Response.json(
    {
      ok: true,
      created: result.created,
      ...(await getReconciliation()),
      ledger: await listCreditLedger(25, userId),
    },
    { headers: NO_STORE },
  );
}
