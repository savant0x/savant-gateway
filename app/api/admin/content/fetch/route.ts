import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import {
  ingestDueSourcesBounded,
  ingestOneSourceBounded,
} from "@/lib/content/ingest";
import { getSource } from "@/lib/content/store/sources";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: Record<string, unknown> = {};

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const db = await getDatabase();
  const sourceId = typeof body.sourceId === "string" ? body.sourceId : null;

  if (sourceId) {
    const source = await getSource(db, sourceId);

    if (!source) return adminError(404, "Source not found.");

    const outcome = await ingestOneSourceBounded(
      db,
      source,
      {},
      { trigger: "manual" },
    );

    if (!outcome.claimed) return adminError(409, outcome.error);

    return Response.json(
      { results: [outcome.result], runId: outcome.runId },
      { headers: NO_STORE },
    );
  }

  const run = await ingestDueSourcesBounded(
    db,
    {},
    { limit: 10, deadlineMs: 45_000, trigger: "admin_batch" },
  );

  return Response.json(
    {
      results: run.results,
      runId: run.runId,
      status: run.status,
      deadlineReached: run.deadlineReached,
    },
    { headers: NO_STORE },
  );
}
