import "server-only";

import { randomUUID } from "node:crypto";

import {
  artificialAnalysisConfigured,
  fetchBenchmarkCatalog,
} from "./artificial-analysis";
import { benchmarkSanityProblem, matchBenchmarks } from "./benchmarks";
import {
  beginSync,
  claimSyncLease,
  completeSync,
  failSync,
  latestSuccessfulSync,
  latestSyncAttempt,
  releaseSyncLease,
  syncLeaseHeld,
  writeBenchmarks,
} from "./store/benchmarks";
import { listAllModels } from "./store/models";

const DAY_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;

function hoursFromEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** How old a stored measurement may be before a page render asks for a sync. */
const REFRESH_MS =
  hoursFromEnv(process.env.AA_REFRESH_HOURS, 24) * 60 * 60 * 1000;
/** Floor between runs, so an impatient refresh cannot spend the daily quota. */
const MIN_INTERVAL_MS =
  hoursFromEnv(process.env.AA_MIN_SYNC_INTERVAL_HOURS, 6) * 60 * 60 * 1000;

export type SyncOutcome =
  | { status: "disabled" }
  | { status: "fresh"; syncedAt: string }
  | { status: "busy" }
  | { status: "quota_exhausted" }
  | {
      status: "ok";
      candidates: number;
      matched: number;
      ambiguous: number;
      quotaRemaining: number | null;
    }
  | { status: "failed"; error: string };

function quotaSpent(quotaRemaining: number | null | undefined) {
  return quotaRemaining === 0;
}

/**
 * The single writer. Every caller — a page render, the admin button — funnels
 * through here, so the lease and the interval are the only things deciding
 * whether a request is spent.
 */
export async function syncBenchmarks({
  force = false,
}: { force?: boolean } = {}): Promise<SyncOutcome> {
  if (!artificialAnalysisConfigured()) return { status: "disabled" };

  const previous = latestSuccessfulSync();
  const attempt = latestSyncAttempt();
  const now = Date.now();

  // A spent window cannot be refilled by trying harder, not even when forced.
  if (previous && quotaSpent(previous.quotaRemaining)) {
    if (now - Date.parse(previous.finishedAt) < DAY_MS) {
      return { status: "quota_exhausted" };
    }
  }

  if (!force && previous) {
    if (now - Date.parse(previous.finishedAt) < MIN_INTERVAL_MS) {
      return { status: "fresh", syncedAt: previous.finishedAt };
    }
  }

  if (
    !force &&
    attempt?.status === "failed" &&
    attempt.finished_at &&
    now - Date.parse(attempt.finished_at) < RETRY_AFTER_FAILURE_MS
  ) {
    return { status: "failed", error: attempt.error ?? "Last sync failed." };
  }

  const runId = randomUUID();

  if (!claimSyncLease(runId, new Date(now + LEASE_MS).toISOString())) {
    return { status: "busy" };
  }

  beginSync(runId);

  try {
    const { parsed, quotaRemaining } = await fetchBenchmarkCatalog();
    const outcome = matchBenchmarks(
      parsed.candidates,
      listAllModels().map((model) => ({
        id: model.id,
        upstreamId: model.upstreamId,
        name: model.name,
        family: model.family,
      })),
    );
    const problem = benchmarkSanityProblem(
      previous
        ? { candidates: previous.candidates, matched: previous.matched }
        : null,
      { candidates: parsed.candidates.length, matched: outcome.matched },
    );

    if (problem) {
      failSync(runId, problem, parsed.candidates.length);

      return { status: "failed", error: problem };
    }

    writeBenchmarks(Object.values(outcome.matches), parsed.indexVersion);
    completeSync({
      runId,
      candidates: parsed.candidates.length,
      matched: outcome.matched,
      indexVersion: parsed.indexVersion,
      quotaRemaining,
    });

    return {
      status: "ok",
      candidates: parsed.candidates.length,
      matched: outcome.matched,
      ambiguous: outcome.ambiguous.length,
      quotaRemaining,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Benchmark sync failed.";

    failSync(runId, message);

    return { status: "failed", error: message };
  } finally {
    releaseSyncLease(runId);
  }
}

/**
 * Stale-while-revalidate, without a scheduler. The render path calls this and
 * ignores the result: the page always serves stored rows, and the refresh lands
 * for a later visitor. Every guard below exists to keep a slow third party and
 * a 100-request window out of the request's latency.
 */
export function ensureBenchmarksFresh(): void {
  if (!artificialAnalysisConfigured()) return;

  const previous = latestSuccessfulSync();
  const attempt = latestSyncAttempt();
  const now = Date.now();

  if (syncLeaseHeld()) return;

  if (previous) {
    if (now - Date.parse(previous.finishedAt) < REFRESH_MS) return;
    if (
      quotaSpent(previous.quotaRemaining) &&
      now - Date.parse(previous.finishedAt) < DAY_MS
    ) {
      return;
    }
  }

  if (
    attempt?.status === "failed" &&
    attempt.finished_at &&
    now - Date.parse(attempt.finished_at) < RETRY_AFTER_FAILURE_MS
  ) {
    return;
  }

  void syncBenchmarks({ force: false }).catch(() => undefined);
}
