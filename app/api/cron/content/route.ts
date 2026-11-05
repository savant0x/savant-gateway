import { timingSafeEqual } from "node:crypto";

import { ingestDueSourcesBounded } from "@/lib/content/ingest";
import { contentCronSecret } from "@/lib/content/policy";
import {
  finishFetchRun,
  readAutomationPolicy,
  startFetchRun,
} from "@/lib/content/store/automation";
import { countDueSources } from "@/lib/content/store/source-due";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;
const RUN_DEADLINE_MS = 35_000;
const RUN_LEASE_MS = 120_000;

function suppliedSecret(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  return (
    bearer ??
    request.headers.get("x-content-secret")?.trim() ??
    request.headers.get("x-cron-secret")?.trim() ??
    ""
  );
}

function matches(supplied: string, expected: string): boolean {
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);

  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

/**
 * One heartbeat contract for GET and POST. The configured secret may be either
 * `CONTENT_CRON_SECRET` or the platform-standard `CRON_SECRET`. A paused policy
 * still records a durable heartbeat and returns the paused state; it does not
 * pretend a source was processed.
 */
async function heartbeat(request: Request) {
  const expected = contentCronSecret();

  if (!expected) {
    return Response.json(
      {
        error:
          "No cron secret is configured. Set CONTENT_CRON_SECRET or CRON_SECRET.",
      },
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
  const read = await readAutomationPolicy(db);

  if (read.error) {
    return Response.json(
      { error: read.error },
      { status: 503, headers: NO_STORE },
    );
  }

  if (!read.policy.enabled) {
    const due = await countDueSources(db);
    const run = await startFetchRun(db, {
      trigger: "scheduled",
      ownerToken: "paused_heartbeat",
      batchLimit: read.policy.batchLimit,
      leaseMs: RUN_LEASE_MS,
      sourcesDue: due,
    });

    await finishFetchRun(db, run.id, {
      status: "paused",
      sourcesClaimed: 0,
      sourcesOk: 0,
      sourcesFailed: 0,
      sourcesSkipped: due,
      deadlineReached: false,
      error:
        "Automation is paused in the dashboard. No source work was admitted.",
    });

    return Response.json(
      {
        paused: true,
        runId: run.id,
        status: "paused",
        due,
        policyRevision: read.policy.revision,
      },
      { headers: NO_STORE },
    );
  }

  const due = await countDueSources(db);
  const run = await ingestDueSourcesBounded(
    db,
    {},
    {
      limit: read.policy.batchLimit,
      deadlineMs: RUN_DEADLINE_MS,
      leaseMs: RUN_LEASE_MS,
      trigger: "scheduled",
    },
  );

  return Response.json(
    {
      paused: false,
      runId: run.runId,
      status: run.status,
      sourcesDue: due,
      claimed: run.claimed,
      skipped: run.skipped,
      deadlineReached: run.deadlineReached,
      results: run.results,
      policyRevision: read.policy.revision,
    },
    { headers: NO_STORE },
  );
}

export async function GET(request: Request) {
  return heartbeat(request);
}

export async function POST(request: Request) {
  return heartbeat(request);
}
