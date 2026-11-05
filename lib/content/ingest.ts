/**
 * Bounded ingestion run (FID-2026-1102-088, extended by FID-2026-1104-015).
 *
 * One run has a durable row, a renewable owner lease and a whole-invocation
 * budget. Due sources are claimed with an enabled/due/revision recheck, and a
 * budget pause stores a checkpoint instead of turning unfinished work into five
 * artificial upstream failures.
 */

import type { PostgresDatabase } from "../storage/pg-adapter.ts";
import type {
  ContentSource,
  FetchRunStatus,
  FetchRunTrigger,
} from "./types.ts";

import { randomUUID } from "node:crypto";

import { IngestBudget } from "./budget.ts";
import {
  ingestSource,
  type IngestDeps,
  type IngestResult,
} from "./ingest-source.ts";
import {
  claimDueSource,
  markSourceClaimStage,
  releaseSourceClaim,
} from "./store/claims.ts";
import { readSourceCheckpoint } from "./store/source-checkpoints.ts";
import { countDueSources } from "./store/source-due.ts";
import { listDueSources } from "./store/sources.ts";
import {
  finishFetchRun,
  recoverInterruptedRuns,
  startFetchRun,
  touchFetchRun,
} from "./store/automation.ts";
import { FETCH_POLICY } from "./url.ts";

export type { IngestDeps, IngestResult } from "./ingest-source.ts";
export { ingestSource } from "./ingest-source.ts";

export type IngestRunOptions = {
  limit?: number;
  /** Total wall-clock budget for this run. Omitted means no deadline. */
  deadlineMs?: number;
  owner?: string;
  leaseMs?: number;
  trigger?: FetchRunTrigger;
};

export type IngestRun = {
  runId: string;
  status: Exclude<FetchRunStatus, "running">;
  results: IngestResult[];
  claimed: number;
  skipped: number;
  deadlineReached: boolean;
  owner: string;
};

/**
 * One bounded scheduled run: a total deadline, one owner per source and a
 * durable claim that survives a process death. Expired claims are reclaimed by
 * the next tick; a live claim held by another owner is skipped, not duplicated.
 */
export async function ingestDueSourcesBounded(
  db: PostgresDatabase,
  deps: IngestDeps = {},
  options: IngestRunOptions = {},
): Promise<IngestRun> {
  const limit = Math.min(50, Math.max(1, options.limit ?? 10));
  const owner = options.owner ?? `ingest_${randomUUID()}`;
  const clock = deps.clock ?? Date.now;
  const leaseMs = options.leaseMs ?? 2 * FETCH_POLICY.timeoutMs;
  const nowIso = deps.now?.() ?? new Date(clock()).toISOString();

  await recoverInterruptedRuns(db, new Date(clock()));

  const sourcesDue = await countDueSources(db, nowIso);
  const run = await startFetchRun(
    db,
    {
      trigger: options.trigger ?? "scheduled",
      ownerToken: owner,
      batchLimit: limit,
      leaseMs,
      sourcesDue,
    },
    new Date(clock()),
  );
  const budget = new IngestBudget(
    options.deadlineMs ?? Number.POSITIVE_INFINITY,
    clock,
  );
  const sources = await listDueSources(db, nowIso, limit);
  const results: IngestResult[] = [];
  let claimed = 0;
  let skipped = 0;
  let deadlineReached = false;
  let paused = 0;

  for (let index = 0; index < sources.length; index += 1) {
    if (budget.expired()) {
      deadlineReached = true;
      skipped += sources.length - index;
      break;
    }

    const source = sources[index];
    const at = new Date(clock()).toISOString();
    const acquired = await claimDueSource(db, {
      sourceId: source.id,
      owner,
      at,
      expiresAt: new Date(clock() + leaseMs).toISOString(),
      runId: run.id,
      sourceRevision: source.configRevision,
    });

    if (!acquired) {
      skipped += 1;
      continue;
    }

    claimed += 1;

    try {
      await markSourceClaimStage(db, source.id, owner, "ingesting");

      if (
        !(await touchFetchRun(db, run.id, owner, leaseMs, new Date(clock())))
      ) {
        deadlineReached = true;
        break;
      }

      const resume = await readSourceCheckpoint(db, source.id);
      const result = await ingestSource(db, source, deps, {
        runId: run.id,
        trigger: options.trigger ?? "scheduled",
        budget,
        resume,
      });

      if (result.paused) paused += 1;

      results.push(result);
      await markSourceClaimStage(db, source.id, owner, "done");
    } finally {
      await releaseSourceClaim(db, source.id, owner);
    }
  }

  const failures = results.filter((result) => !result.ok);
  const status: Exclude<FetchRunStatus, "running"> =
    results.length > 0 && failures.length === results.length
      ? "failed"
      : deadlineReached || failures.length > 0 || paused > 0 || skipped > 0
        ? "partial"
        : "ok";
  const error =
    failures[0]?.error ??
    (paused > 0
      ? `${paused} source(s) paused with resumable work.`
      : deadlineReached
        ? "The run budget was exhausted before every due source was claimed."
        : null);

  await finishFetchRun(
    db,
    run.id,
    {
      status,
      sourcesClaimed: claimed,
      sourcesOk: results.length - failures.length - paused,
      sourcesFailed: failures.length,
      sourcesSkipped: skipped,
      deadlineReached,
      error,
    },
    new Date(clock()),
  );

  return {
    runId: run.id,
    status,
    results,
    claimed,
    skipped,
    deadlineReached,
    owner,
  };
}

export type ManualIngest =
  | { claimed: true; runId: string; result: IngestResult }
  | { claimed: false; error: string };

/**
 * One explicit operator fetch. It uses the same run row, owner lease and claim
 * as the scheduler; `allowNotDue` only bypasses the interval clock. A disabled
 * source or a live claim is refused instead of silently ingesting twice.
 */
export async function ingestOneSourceBounded(
  db: PostgresDatabase,
  source: ContentSource,
  deps: IngestDeps = {},
  options: { deadlineMs?: number; trigger?: FetchRunTrigger } = {},
): Promise<ManualIngest> {
  const owner = `manual_${randomUUID()}`;
  const clock = deps.clock ?? Date.now;
  const leaseMs = 2 * FETCH_POLICY.timeoutMs;
  const run = await startFetchRun(
    db,
    {
      trigger: options.trigger ?? "manual",
      ownerToken: owner,
      batchLimit: 1,
      leaseMs,
      sourcesDue: 1,
    },
    new Date(clock()),
  );
  const at = new Date(clock()).toISOString();
  const acquired = await claimDueSource(db, {
    sourceId: source.id,
    owner,
    at,
    expiresAt: new Date(clock() + leaseMs).toISOString(),
    runId: run.id,
    sourceRevision: source.configRevision,
    allowNotDue: true,
  });

  if (!acquired) {
    await finishFetchRun(
      db,
      run.id,
      {
        status: "partial",
        sourcesClaimed: 0,
        sourcesOk: 0,
        sourcesFailed: 0,
        sourcesSkipped: 1,
        deadlineReached: false,
        error: "The source is disabled or already claimed by another fetch.",
      },
      new Date(clock()),
    );

    return {
      claimed: false,
      error: "The source is disabled or already claimed by another fetch.",
    };
  }

  try {
    await markSourceClaimStage(db, source.id, owner, "ingesting");

    const budget = new IngestBudget(options.deadlineMs ?? 35_000, clock);
    const resume = await readSourceCheckpoint(db, source.id);
    const result = await ingestSource(db, source, deps, {
      runId: run.id,
      trigger: options.trigger ?? "manual",
      budget,
      resume,
    });
    const status: Exclude<FetchRunStatus, "running"> = !result.ok
      ? "failed"
      : result.paused
        ? "partial"
        : "ok";

    await finishFetchRun(
      db,
      run.id,
      {
        status,
        sourcesClaimed: 1,
        sourcesOk: result.ok && !result.paused ? 1 : 0,
        sourcesFailed: result.ok ? 0 : 1,
        sourcesSkipped: 0,
        deadlineReached: false,
        error: result.error ?? null,
      },
      new Date(clock()),
    );

    return { claimed: true, runId: run.id, result };
  } finally {
    await releaseSourceClaim(db, source.id, owner);
  }
}

/** Compatibility wrapper: callers that only need the results. */
export async function ingestDueSources(
  db: PostgresDatabase,
  deps: IngestDeps = {},
  limit = 10,
): Promise<IngestResult[]> {
  return (await ingestDueSourcesBounded(db, deps, { limit })).results;
}
