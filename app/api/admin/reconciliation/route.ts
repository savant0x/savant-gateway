import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { isJsonObject } from "@/lib/http";
import {
  getReconciliation,
  listBalanceBaselines,
  saveBaseline,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reconciliation read model: totals, per-account differences and baselines. */
export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  return Response.json(
    {
      ...getReconciliation(),
      baselines: listBalanceBaselines(25),
    },
    { headers: NO_STORE },
  );
}

/**
 * Records a dated opening balance for history that predates ledger coverage.
 * It is an explicit operator record, never a fabricated transaction.
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

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const baselineUsd =
    typeof body.baselineUsd === "number" ? body.baselineUsd : Number.NaN;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const baselineMicros = Math.round(baselineUsd * 1_000_000);

  if (!userId) return adminError(400, "userId is required.");
  if (
    !Number.isFinite(baselineUsd) ||
    baselineUsd < 0 ||
    !Number.isSafeInteger(baselineMicros)
  ) {
    return adminError(400, "baselineUsd must be a nonnegative dollar amount.");
  }

  if (!saveBaseline({ userId, baselineMicros, note })) {
    return adminError(404, "Customer not found.");
  }

  return Response.json(
    { ok: true, ...getReconciliation(), baselines: listBalanceBaselines(25) },
    { headers: NO_STORE },
  );
}
