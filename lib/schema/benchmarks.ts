import { ensureColumn, type DatabaseHandle } from "./columns";

/**
 * Benchmark measurements and the log of the syncs that produced them. The
 * tables exist to keep a rate-limited third party off the render path: the
 * catalog reads these rows, never the network.
 */
export function benchmarkSchema(database: DatabaseHandle) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS model_benchmarks (
      model_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_id TEXT,
      source_slug TEXT,
      intelligence_index REAL,
      index_version TEXT,
      output_tokens_per_second REAL,
      ttft_seconds REAL,
      measured_at TEXT,
      matched_by TEXT NOT NULL,
      stale INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (model_id, source)
    );

    CREATE TABLE IF NOT EXISTS benchmark_syncs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      candidates INTEGER NOT NULL DEFAULT 0,
      matched INTEGER NOT NULL DEFAULT 0,
      index_version TEXT,
      quota_remaining INTEGER,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS benchmark_syncs_started_idx
      ON benchmark_syncs(source, started_at);

    CREATE TABLE IF NOT EXISTS benchmark_sync_locks (
      source TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      lease_until TEXT NOT NULL
    );
  `);

  // Indexes and response time arrived after the first sync, so an existing
  // database has to grow the columns rather than be rebuilt.
  ensureColumn(database, "model_benchmarks", "coding_index", "REAL");
  ensureColumn(database, "model_benchmarks", "agentic_index", "REAL");
  ensureColumn(database, "model_benchmarks", "end_to_end_seconds", "REAL");
  ensureColumn(database, "model_benchmarks", "release_date", "TEXT");
}
