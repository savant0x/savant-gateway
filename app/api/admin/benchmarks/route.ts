import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { syncBenchmarks } from "@/lib/benchmark-sync";
import { isJsonObject } from "@/lib/http";
import { getBenchmarkStatus, listAllModels } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  return Response.json(getBenchmarkStatus(listAllModels().length), {
    headers: NO_STORE,
  });
}

/**
 * Runs the same sync the render path can start, but awaits it so the operator
 * sees the outcome. The lease makes a double click harmless; the quota check
 * inside refuses to spend a window that is already empty.
 */
export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: { force?: unknown } = {};

  try {
    const parsed: unknown = await request.json();

    if (!isJsonObject(parsed)) {
      return adminError(400, "Request body must be a JSON object.");
    }

    body = parsed;
  } catch {
    // An empty body means "refresh if the interval allows it".
  }

  if (body.force !== undefined && typeof body.force !== "boolean") {
    return adminError(400, "force must be a boolean.");
  }

  const outcome = await syncBenchmarks({ force: body.force === true });

  return Response.json(outcome, { headers: NO_STORE });
}
