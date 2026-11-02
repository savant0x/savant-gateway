import { timingSafeEqual } from "node:crypto";

import { ingestDueSources } from "@/lib/content/ingest";
import { contentCronSecret, contentIngestEnabled } from "@/lib/content/policy";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function suppliedSecret(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  return bearer ?? request.headers.get("x-content-secret")?.trim() ?? "";
}

function matches(supplied: string, expected: string): boolean {
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);

  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!contentIngestEnabled()) {
    return Response.json(
      {
        error:
          "Content ingestion is disabled. Set CONTENT_INGEST_ENABLED=true.",
      },
      { status: 503, headers: NO_STORE },
    );
  }

  const expected = contentCronSecret();

  if (!expected) {
    return Response.json(
      { error: "CONTENT_CRON_SECRET is not configured." },
      { status: 503, headers: NO_STORE },
    );
  }

  if (!matches(suppliedSecret(request), expected)) {
    return Response.json(
      { error: "Invalid cron secret." },
      { status: 401, headers: NO_STORE },
    );
  }

  const db = await getDatabase();
  const results = await ingestDueSources(db, {}, 10);

  return Response.json(
    {
      sources: results.length,
      ok: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      results,
    },
    { headers: NO_STORE },
  );
}
