import { guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { listFetchRuns } from "@/lib/content/store/automation";
import { listCycleHistory } from "@/lib/content/store/cycles";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paged history. `view=runs` returns execution receipts; the default returns
 * per-source cycles, including rows whose source was deliberately deleted.
 */
export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  const params = new URL(request.url).searchParams;
  const db = await getDatabase();

  if (params.get("view") === "runs") {
    const page = await listFetchRuns(db, {
      limit: params.get("limit"),
      cursor: params.get("cursor"),
    });

    return Response.json(page, { headers: NO_STORE });
  }

  const page = await listCycleHistory(db, {
    limit: params.get("limit"),
    cursor: params.get("cursor"),
    sourceId: params.get("sourceId"),
    runId: params.get("runId"),
    status: params.get("status"),
    trigger: params.get("trigger"),
  });

  return Response.json(page, { headers: NO_STORE });
}
