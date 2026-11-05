import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Durable content/model link decisions (FID-2026-1104-016).
 *
 * The old `reviewed` flag could not distinguish an operator acceptance from an
 * automatic publication, and deleting a dismissed row allowed the next fetch to
 * recreate it. This additive migration keeps the old column for compatibility
 * but makes `state` the decision authority. Existing rows are labelled exactly:
 * operator rows become accepted, reviewed automatic rows become auto-published,
 * and everything else stays suggested.
 *
 * `decision_source` is non-null on every row the migration touches, so the
 * backfill is idempotent and never reclassifies a row written after migration.
 */
export async function contentDecisionsSchema(db: PostgresDatabase) {
  await db.exec(`
    ALTER TABLE IF EXISTS content.model_links
      ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'suggested',
      ADD COLUMN IF NOT EXISTS decision_at TEXT,
      ADD COLUMN IF NOT EXISTS decision_source TEXT,
      ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'content_model_links_state_check'
      ) THEN
        ALTER TABLE content.model_links
          ADD CONSTRAINT content_model_links_state_check
          CHECK (state IN ('suggested', 'auto_published', 'accepted',
                           'dismissed', 'retired'));
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'content_model_links_decision_source_check'
      ) THEN
        ALTER TABLE content.model_links
          ADD CONSTRAINT content_model_links_decision_source_check
          CHECK (decision_source IS NULL OR
                 decision_source IN ('operator', 'system', 'migration'));
      END IF;
    END $$;

    UPDATE content.model_links
       SET state = CASE
             WHEN relation_source = 'operator' THEN 'accepted'
             WHEN reviewed = 1 THEN 'auto_published'
             ELSE 'suggested'
           END,
           reviewed = CASE
             WHEN relation_source = 'operator' OR reviewed = 1 THEN 1
             ELSE 0
           END,
           decision_at = COALESCE(decision_at, updated_at),
           decision_source = 'migration'
     WHERE decision_source IS NULL;

    CREATE INDEX IF NOT EXISTS content_model_links_state_idx
      ON content.model_links(state, model_id);

    CREATE TABLE IF NOT EXISTS content.link_decisions (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES content.items(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL,
      action TEXT NOT NULL
        CHECK (action IN ('suggested', 'auto_published', 'accepted',
                          'dismissed', 'restored', 'retired')),
      actor TEXT NOT NULL
        CHECK (actor IN ('operator', 'system', 'migration')),
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      link_revision INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS content_link_decisions_item_idx
      ON content.link_decisions(item_id, created_at DESC);

    INSERT INTO content.link_decisions
      (id, item_id, model_id, action, actor, reason, created_at,
       link_revision)
    SELECT 'mig_' || md5(l.item_id || ':' || l.model_id),
           l.item_id, l.model_id,
           CASE l.state
             WHEN 'accepted' THEN 'accepted'
             WHEN 'auto_published' THEN 'auto_published'
             ELSE 'suggested'
           END,
           'migration',
           'Existing link classified by the durable decision migration',
           COALESCE(l.decision_at, l.updated_at),
           l.revision
      FROM content.model_links l
     WHERE l.decision_source = 'migration'
       AND NOT EXISTS (
         SELECT 1 FROM content.link_decisions d
          WHERE d.item_id = l.item_id AND d.model_id = l.model_id
       );
  `);
}
