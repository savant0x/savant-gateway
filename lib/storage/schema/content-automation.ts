import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Additive automation schema (FID-2026-1104-015).
 *
 * `fetch_cycles` keeps its historical source reference, but a deliberately
 * deleted source must not erase the receipt. The source label is snapshotted,
 * the reference becomes nullable, and the foreign key changes from CASCADE to
 * SET NULL. Every statement is idempotent so the normal boot migration can run
 * repeatedly.
 */
export async function contentAutomationSchema(db: PostgresDatabase) {
  await db.exec(`
    ALTER TABLE IF EXISTS content.sources
      ADD COLUMN IF NOT EXISTS last_success_at TEXT,
      ADD COLUMN IF NOT EXISTS config_revision INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS checkpoint_json TEXT;

    CREATE TABLE IF NOT EXISTS content.fetch_runs (
      id TEXT PRIMARY KEY,
      trigger TEXT NOT NULL
        CHECK (trigger IN ('scheduled', 'manual', 'admin_batch', 'legacy')),
      status TEXT NOT NULL
        CHECK (status IN ('running', 'ok', 'partial', 'failed', 'paused', 'interrupted')),
      started_at TEXT NOT NULL,
      finished_at TEXT,
      expires_at TEXT NOT NULL,
      owner_token TEXT NOT NULL,
      batch_limit INTEGER NOT NULL,
      sources_due INTEGER NOT NULL DEFAULT 0,
      sources_claimed INTEGER NOT NULL DEFAULT 0,
      sources_ok INTEGER NOT NULL DEFAULT 0,
      sources_failed INTEGER NOT NULL DEFAULT 0,
      sources_skipped INTEGER NOT NULL DEFAULT 0,
      deadline_reached INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS content_fetch_runs_started_idx
      ON content.fetch_runs(started_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS content_fetch_runs_status_idx
      ON content.fetch_runs(status, expires_at);

    ALTER TABLE IF EXISTS content.fetch_cycles
      ADD COLUMN IF NOT EXISTS run_id TEXT,
      ADD COLUMN IF NOT EXISTS source_label TEXT,
      ADD COLUMN IF NOT EXISTS trigger TEXT NOT NULL DEFAULT 'legacy',
      ADD COLUMN IF NOT EXISTS budget_stopped INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE IF EXISTS content.ingest_claims
      ADD COLUMN IF NOT EXISTS run_id TEXT,
      ADD COLUMN IF NOT EXISTS source_revision INTEGER NOT NULL DEFAULT 0;

    CREATE INDEX IF NOT EXISTS content_fetch_cycles_run_idx
      ON content.fetch_cycles(run_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS content_fetch_cycles_started_idx
      ON content.fetch_cycles(started_at DESC, id DESC);
  `);

  // Snapshot the label before the source reference can become null.
  await db.exec(`
    UPDATE content.fetch_cycles c
       SET source_label = s.label
      FROM content.sources s
     WHERE c.source_id = s.id
       AND c.source_label IS NULL;
  `);

  // The original source reference used ON DELETE CASCADE. Replace every
  // matching foreign key with a nullable SET NULL reference; the snapshot above
  // is what keeps the receipt readable after a deliberate source deletion.
  await db.exec(`
    DO $$
    DECLARE constraint_name text;
    BEGIN
      FOR constraint_name IN
        SELECT conname
          FROM pg_constraint
         WHERE conrelid = 'content.fetch_cycles'::regclass
           AND contype = 'f'
           AND confrelid = 'content.sources'::regclass
      LOOP
        EXECUTE format(
          'ALTER TABLE content.fetch_cycles DROP CONSTRAINT %I',
          constraint_name
        );
      END LOOP;
    END $$;

    ALTER TABLE content.fetch_cycles ALTER COLUMN source_id DROP NOT NULL;
  `);

  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'content.fetch_cycles'::regclass
           AND conname = 'content_fetch_cycles_source_fk'
      ) THEN
        ALTER TABLE content.fetch_cycles
          ADD CONSTRAINT content_fetch_cycles_source_fk
          FOREIGN KEY (source_id) REFERENCES content.sources(id)
          ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  // Budget stops and expired owners need honest terminal states instead of being
  // reported as upstream failures. Replace the original status check in place.
  await db.exec(`
    DO $$
    DECLARE constraint_name text;
    BEGIN
      FOR constraint_name IN
        SELECT conname
          FROM pg_constraint
         WHERE conrelid = 'content.fetch_cycles'::regclass
           AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%status%'
      LOOP
        EXECUTE format(
          'ALTER TABLE content.fetch_cycles DROP CONSTRAINT %I',
          constraint_name
        );
      END LOOP;
    END $$;

    ALTER TABLE content.fetch_cycles
      ADD CONSTRAINT content_fetch_cycles_status_check
      CHECK (status IN ('running', 'ok', 'error', 'paused', 'interrupted'));
  `);

  // A successful finished cycle is the only proof of success. A failed attempt
  // never backfills this clock.
  await db.exec(`
    UPDATE content.sources s
       SET last_success_at = proof.last_success
      FROM (
        SELECT source_id, MAX(finished_at) AS last_success
          FROM content.fetch_cycles
         WHERE status = 'ok' AND source_id IS NOT NULL
         GROUP BY source_id
      ) proof
     WHERE s.id = proof.source_id
       AND s.last_success_at IS NULL;
  `);
}
