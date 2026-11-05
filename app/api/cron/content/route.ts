import { timingSafeEqual } from "node:crypto";

import { ingestDueSourcesBounded } from "@/lib/content/ingest";
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
  // The route has 60 seconds; stop starting new sources at 45 so the response
  // is written before the platform kills the function. Claims make the
  // remaining work resumable on the next tick.
  const run = await ingestDueSourcesBounded(
    db,
    {},
    {
      limit: 10,
      deadlineMs: 45_000,
    },
  );

  return Response.json(
    {
      sources: run.results.length,
      ok: run.results.filter((result) => result.ok).length,
      failed: run.results.filter((result) => !result.ok).length,
      claimed: run.claimed,
      skipped: run.skipped,
      deadlineReached: run.deadlineReached,
      results: run.results,
    },
    { headers: NO_STORE },
  );
}
