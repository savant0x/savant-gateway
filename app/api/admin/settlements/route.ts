import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { isJsonObject } from "@/lib/http";
import { listSettlementState, releaseQuarantined } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Inspect admitted/quarantined settlements; never mutates on read. */
export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  return Response.json(listSettlementState(50), { headers: NO_STORE });
}

/**
 * The only resolution is an audited release of one quarantined reservation.
 * No charge is invented from an unknown outcome.
 */
export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  if (!isJsonObject(body)) {
    return adminError(400, "Request body must be a JSON object.");
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";

  if (!id) return adminError(400, "id is required.");

  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!releaseQuarantined(id, note || "Operator release")) {
    return adminError(
      404,
      "Quarantined reservation not found or already released.",
    );
  }

  return Response.json(
    { ok: true, ...listSettlementState(50) },
    { headers: NO_STORE },
  );
}
