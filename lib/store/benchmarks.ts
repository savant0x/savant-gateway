import "server-only";

import type { BenchmarkSummary, BenchmarkStatus } from "../types";
import type { BenchmarkMatch } from "../benchmarks";

import { artificialAnalysisConfigured } from "../artificial-analysis";
import { BENCHMARK_SOURCE } from "../benchmarks";
import { db, nowIso } from "../db";

type BenchmarkRow = {
  model_id: string;
  intelligence_index: number | null;
  coding_index: number | null;
  agentic_index: number | null;
  index_version: string | null;
  source_slug: string | null;
  output_tokens_per_second: number | null;
  ttft_seconds: number | null;
  end_to_end_seconds: number | null;
  release_date: string | null;
  measured_at: string | null;
  stale: number;
};

type SyncRow = {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  candidates: number;
  matched: number;
  index_version: string | null;
  quota_remaining: number | null;
  error: string | null;
};

export type SyncSummary = {
  finishedAt: string;
  candidates: number;
  matched: number;
  indexVersion: string | null;
  quotaRemaining: number | null;
};

export function listBenchmarks(): Record<string, BenchmarkSummary> {
  const rows = db
    .prepare(
      `SELECT model_id, intelligence_index, coding_index, agentic_index,
              index_version, source_slug, output_tokens_per_second,
              ttft_seconds, end_to_end_seconds, release_date, measured_at,
              stale
       FROM model_benchmarks
       WHERE source = ?`,
    )
    .all(BENCHMARK_SOURCE) as BenchmarkRow[];
  const benchmarks: Record<string, BenchmarkSummary> = {};

  for (const row of rows) {
    benchmarks[row.model_id] = {
      intelligenceIndex: row.intelligence_index,
      codingIndex: row.coding_index,
      agenticIndex: row.agentic_index,
      indexVersion: row.index_version,
      sourceSlug: row.source_slug,
      outputTokensPerSecond: row.output_tokens_per_second,
      ttftSeconds: row.ttft_seconds,
      endToEndSeconds: row.end_to_end_seconds,
      releaseDate: row.release_date,
      measuredAt: row.measured_at,
      stale: row.stale === 1,
    };
  }

  return benchmarks;
}

export function latestSuccessfulSync(): SyncSummary | null {
  const row = db
    .prepare(
      `SELECT finished_at, candidates, matched, index_version, quota_remaining
       FROM benchmark_syncs
       WHERE source = ? AND status = 'ok' AND finished_at IS NOT NULL
       ORDER BY finished_at DESC
       LIMIT 1`,
    )
    .get(BENCHMARK_SOURCE) as
    | {
        finished_at: string;
        candidates: number;
        matched: number;
        index_version: string | null;
        quota_remaining: number | null;
      }
    | undefined;

  if (!row) return null;

  return {
    finishedAt: row.finished_at,
    candidates: row.candidates,
    matched: row.matched,
    indexVersion: row.index_version,
    quotaRemaining: row.quota_remaining,
  };
}

export function latestSyncAttempt(): SyncRow | null {
  const row = db
    .prepare(
      `SELECT id, status, started_at, finished_at, candidates, matched,
              index_version, quota_remaining, error
       FROM benchmark_syncs
       WHERE source = ?
       ORDER BY started_at DESC
       LIMIT 1`,
    )
    .get(BENCHMARK_SOURCE) as SyncRow | undefined;

  return row ?? null;
}

export function syncLeaseHeld(now = nowIso()): boolean {
  const row = db
    .prepare(
      "SELECT run_id FROM benchmark_sync_locks WHERE source = ? AND lease_until > ?",
    )
    .get(BENCHMARK_SOURCE, now) as { run_id: string } | undefined;

  return Boolean(row);
}

/** Claims the single-writer lease. False means another run holds it. */
export function claimSyncLease(runId: string, leaseUntil: string): boolean {
  const result = db
    .prepare(
      `INSERT INTO benchmark_sync_locks (source, run_id, lease_until)
       VALUES (?, ?, ?)
       ON CONFLICT(source) DO UPDATE SET
         run_id = excluded.run_id,
         lease_until = excluded.lease_until
       WHERE benchmark_sync_locks.lease_until < ?`,
    )
    .run(BENCHMARK_SOURCE, runId, leaseUntil, nowIso());

  return result.changes === 1;
}

export function releaseSyncLease(runId: string) {
  db.prepare(
    "DELETE FROM benchmark_sync_locks WHERE source = ? AND run_id = ?",
  ).run(BENCHMARK_SOURCE, runId);
}

export function beginSync(runId: string) {
  db.prepare(
    `INSERT INTO benchmark_syncs (id, source, status, started_at)
     VALUES (?, ?, 'running', ?)`,
  ).run(runId, BENCHMARK_SOURCE, nowIso());
}

export function completeSync({
  runId,
  candidates,
  matched,
  indexVersion,
  quotaRemaining,
}: {
  runId: string;
  candidates: number;
  matched: number;
  indexVersion: string | null;
  quotaRemaining: number | null;
}) {
  db.prepare(
    `UPDATE benchmark_syncs
     SET status = 'ok', finished_at = ?, candidates = ?, matched = ?,
         index_version = ?, quota_remaining = ?, error = NULL
     WHERE id = ?`,
  ).run(nowIso(), candidates, matched, indexVersion, quotaRemaining, runId);
}

export function failSync(runId: string, error: string, candidates = 0) {
  db.prepare(
    `UPDATE benchmark_syncs
     SET status = 'failed', finished_at = ?, candidates = ?, error = ?
     WHERE id = ?`,
  ).run(nowIso(), candidates, error.slice(0, 500), runId);
}

/**
 * One transaction: every row is marked stale, then the matched rows are written
 * fresh. Rows that disappeared from the source keep their numbers and their
 * stale flag instead of being deleted — deletion would erase history we cannot
 * re-fetch once their catalogue moves on.
 */
export function writeBenchmarks(
  matches: BenchmarkMatch[],
  indexVersion: string | null,
) {
  const updatedAt = nowIso();
  const staleAll = db.prepare(
    "UPDATE model_benchmarks SET stale = 1 WHERE source = ?",
  );
  const upsert = db.prepare(
    `INSERT INTO model_benchmarks (
       model_id, source, source_id, source_slug, intelligence_index,
       coding_index, agentic_index, index_version, output_tokens_per_second,
       ttft_seconds, end_to_end_seconds, release_date, measured_at, matched_by,
       stale, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(model_id, source) DO UPDATE SET
       source_id = excluded.source_id,
       source_slug = excluded.source_slug,
       intelligence_index = excluded.intelligence_index,
       coding_index = excluded.coding_index,
       agentic_index = excluded.agentic_index,
       index_version = excluded.index_version,
       output_tokens_per_second = excluded.output_tokens_per_second,
       ttft_seconds = excluded.ttft_seconds,
       end_to_end_seconds = excluded.end_to_end_seconds,
       release_date = excluded.release_date,
       measured_at = excluded.measured_at,
       matched_by = excluded.matched_by,
       stale = 0,
       updated_at = excluded.updated_at`,
  );

  db.transaction(() => {
    staleAll.run(BENCHMARK_SOURCE);

    for (const match of matches) {
      upsert.run(
        match.modelId,
        BENCHMARK_SOURCE,
        match.sourceId,
        match.sourceSlug,
        match.intelligenceIndex,
        match.codingIndex,
        match.agenticIndex,
        indexVersion,
        match.outputTokensPerSecond,
        match.ttftSeconds,
        match.endToEndSeconds,
        match.releaseDate,
        match.measuredAt,
        match.matchedBy,
        updatedAt,
      );
    }
  })();
}

export function getBenchmarkStatus(total: number): BenchmarkStatus {
  const ok = latestSuccessfulSync();
  const attempt = latestSyncAttempt();

  return {
    configured: artificialAnalysisConfigured(),
    syncedAt: ok?.finishedAt ?? null,
    indexVersion: ok?.indexVersion ?? null,
    candidates: ok?.candidates ?? 0,
    matched: ok?.matched ?? 0,
    total,
    quotaRemaining: ok?.quotaRemaining ?? null,
    running: syncLeaseHeld(),
    lastAttemptAt: attempt?.started_at ?? null,
    lastError: attempt?.status === "failed" ? attempt.error : null,
  };
}
