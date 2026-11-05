import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Stored-content rematch receipts (FID-2026-1104-017).
 *
 * A rematch reads the content archive; it never fetches a publisher. One row
 * tracks a resumable keyset cursor, the owner lease and the processed/changed
 * counts. A paused row is how a bounded invocation hands work to the next one.
 */
export async function contentMatchingSchema(db: PostgresDatabase) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS content.rematch_runs (
      id TEXT PRIMARY KEY,
      trigger TEXT NOT NULL
        CHECK (trigger IN ('manual', 'policy', 'catalog')),
      status TEXT NOT NULL
        CHECK (status IN ('running', 'paused', 'ok', 'failed', 'interrupted')),
      started_at TEXT NOT NULL,
      finished_at TEXT,
      expires_at TEXT NOT NULL,
      owner_token TEXT NOT NULL DEFAULT '',
      cursor_item_id TEXT,
      processed INTEGER NOT NULL DEFAULT 0,
      changed INTEGER NOT NULL DEFAULT 0,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
    ALTER TABLE IF EXISTS content.rematch_runs
      ADD COLUMN IF NOT EXISTS cancel_requested INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS content_rematch_runs_started_idx
      ON content.rematch_runs(started_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS content_rematch_runs_status_idx
      ON content.rematch_runs(status, expires_at);
  `);
}
