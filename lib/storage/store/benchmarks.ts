import type { PostgresDatabase } from "../pg-adapter.ts";
import type { BenchmarkSummary, BenchmarkStatus } from "../../types.ts";
import type { BenchmarkMatch } from "../../benchmarks.ts";

import { BENCHMARK_SOURCE } from "../../benchmarks.ts";

/**
 * Benchmark store, ported to the async handle (FID-086 Batch B).
 *
 * Two behaviours are load-bearing and unchanged:
 *
 * 1. **The lease is a conditional write.** `ON CONFLICT DO UPDATE ... WHERE
 *    lease_until < now` means two concurrent syncs cannot both run; the second
 *    insert conflicts and its `WHERE` is false, so it changes no rows and
 *    `claimSyncLease` returns false. In SQLite the single-writer lock made that
 *    atomic by accident; here it is the statement.
 * 2. **A disappeared row is marked stale, never deleted.** The whole source is
 *    flagged stale and matched rows are written fresh in one transaction, so
 *    history survives a catalogue that no longer lists the model.
 *
 * Ordering takes an explicit `::timestamptz` cast because the timestamps are
 * ISO-8601 text.
 */

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
  candidates: number | string;
  matched: number | string;
  index_version: string | null;
  quota_remaining: number | string | null;
  error: string | null;
};

export type SyncSummary = {
  finishedAt: string;
  candidates: number;
  matched: number;
  indexVersion: string | null;
  quotaRemaining: number | null;
};

export async function listBenchmarks(
  db: PostgresDatabase,
): Promise<Record<string, BenchmarkSummary>> {
  const rows = await db
    .prepare(
      `SELECT model_id, intelligence_index, coding_index, agentic_index,
              index_version, source_slug, output_tokens_per_second,
              ttft_seconds, end_to_end_seconds, release_date, measured_at,
              stale
         FROM model_benchmarks
        WHERE source = ?`,
    )
    .all<BenchmarkRow>(BENCHMARK_SOURCE);
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
      stale: Number(row.stale) === 1,
    };
  }

  return benchmarks;
}

export async function latestSuccessfulSync(
  db: PostgresDatabase,
): Promise<SyncSummary | null> {
  const row = await db
    .prepare(
      `SELECT finished_at, candidates, matched, index_version, quota_remaining
         FROM benchmark_syncs
        WHERE source = ? AND status = 'ok' AND finished_at IS NOT NULL
        ORDER BY finished_at::timestamptz DESC
        LIMIT 1`,
    )
    .get<{
      finished_at: string;
      candidates: number | string;
      matched: number | string;
      index_version: string | null;
      quota_remaining: number | string | null;
    }>(BENCHMARK_SOURCE);

  if (!row) return null;

  return {
    finishedAt: row.finished_at,
    candidates: Number(row.candidates),
    matched: Number(row.matched),
    indexVersion: row.index_version,
    quotaRemaining:
      row.quota_remaining === null ? null : Number(row.quota_remaining),
  };
}

export async function latestSyncAttempt(
  db: PostgresDatabase,
): Promise<SyncRow | null> {
  const row = await db
    .prepare(
      `SELECT id, status, started_at, finished_at, candidates, matched,
              index_version, quota_remaining, error
         FROM benchmark_syncs
        WHERE source = ?
        ORDER BY started_at::timestamptz DESC
        LIMIT 1`,
    )
    .get<SyncRow>(BENCHMARK_SOURCE);

  return row ?? null;
}

export async function syncLeaseHeld(
  db: PostgresDatabase,
  now = new Date().toISOString(),
) {
  const row = await db
    .prepare(
      "SELECT run_id FROM benchmark_sync_locks WHERE source = ? AND lease_until > ?",
    )
    .get<{ run_id: string }>(BENCHMARK_SOURCE, now);

  return Boolean(row);
}

/** Claims the single-writer lease. False means another run holds it. */
export async function claimSyncLease(
  db: PostgresDatabase,
  runId: string,
  leaseUntil: string,
) {
  const result = await db
    .prepare(
      `INSERT INTO benchmark_sync_locks (source, run_id, lease_until)
       VALUES (?, ?, ?)
       ON CONFLICT (source) DO UPDATE SET
         run_id = excluded.run_id,
         lease_until = excluded.lease_until
       WHERE benchmark_sync_locks.lease_until < ?`,
    )
    .run(BENCHMARK_SOURCE, runId, leaseUntil, new Date().toISOString());

  return result.changes === 1;
}

export async function releaseSyncLease(db: PostgresDatabase, runId: string) {
  await db
    .prepare("DELETE FROM benchmark_sync_locks WHERE source = ? AND run_id = ?")
    .run(BENCHMARK_SOURCE, runId);
}

export async function beginSync(db: PostgresDatabase, runId: string) {
  await db
    .prepare(
      `INSERT INTO benchmark_syncs (id, source, status, started_at)
       VALUES (?, ?, 'running', ?)`,
    )
    .run(runId, BENCHMARK_SOURCE, new Date().toISOString());
}

export async function completeSync(
  db: PostgresDatabase,
  input: {
    runId: string;
    candidates: number;
    matched: number;
    indexVersion: string | null;
    quotaRemaining: number | null;
  },
) {
  await db
    .prepare(
      `UPDATE benchmark_syncs
          SET status = 'ok', finished_at = ?, candidates = ?, matched = ?,
              index_version = ?, quota_remaining = ?, error = NULL
        WHERE id = ?`,
    )
    .run(
      new Date().toISOString(),
      input.candidates,
      input.matched,
      input.indexVersion,
      input.quotaRemaining,
      input.runId,
    );
}

export async function failSync(
  db: PostgresDatabase,
  runId: string,
  error: string,
  candidates = 0,
) {
  await db
    .prepare(
      `UPDATE benchmark_syncs
          SET status = 'failed', finished_at = ?, candidates = ?, error = ?
        WHERE id = ?`,
    )
    .run(new Date().toISOString(), candidates, error.slice(0, 500), runId);
}

/**
 * One transaction: every row is marked stale, then the matched rows are written
 * fresh. Rows that disappeared from the source keep their numbers and their
 * stale flag instead of being deleted — deletion would erase history we cannot
 * re-fetch once their catalogue moves on.
 */
export async function writeBenchmarks(
  db: PostgresDatabase,
  matches: BenchmarkMatch[],
  indexVersion: string | null,
) {
  const updatedAt = new Date().toISOString();

  await db
    .transaction(async () => {
      await db
        .prepare("UPDATE model_benchmarks SET stale = 1 WHERE source = ?")
        .run(BENCHMARK_SOURCE);

      const upsert = db.prepare(
        `INSERT INTO model_benchmarks (
           model_id, source, source_id, source_slug, intelligence_index,
           coding_index, agentic_index, index_version, output_tokens_per_second,
           ttft_seconds, end_to_end_seconds, release_date, measured_at,
           matched_by, stale, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT (model_id, source) DO UPDATE SET
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

      for (const match of matches) {
        await upsert.run(
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
    })
    .immediate();
}

/**
 * `configured` is a parameter rather than an env read here on purpose:
 * `lib/artificial-analysis.ts` imports `server-only`, so a ported module that
 * imported it could not be loaded by the test runner at all. The caller owns
 * configuration; this module owns the stored state.
 */
export async function getBenchmarkStatus(
  db: PostgresDatabase,
  total: number,
  configured: boolean,
): Promise<BenchmarkStatus> {
  const ok = await latestSuccessfulSync(db);
  const attempt = await latestSyncAttempt(db);

  return {
    configured,
    syncedAt: ok?.finishedAt ?? null,
    indexVersion: ok?.indexVersion ?? null,
    candidates: ok?.candidates ?? 0,
    matched: ok?.matched ?? 0,
    total,
    quotaRemaining: ok?.quotaRemaining ?? null,
    running: await syncLeaseHeld(db),
    lastAttemptAt: attempt?.started_at ?? null,
    lastError: attempt?.status === "failed" ? attempt.error : null,
  };
}
