import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { ingestDueSources, ingestSource } from "@/lib/content/ingest";
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

    const result = await ingestSource(db, source);

    return Response.json({ results: [result] }, { headers: NO_STORE });
  }

  const results = await ingestDueSources(db, {}, 10);

  return Response.json({ results }, { headers: NO_STORE });
}
