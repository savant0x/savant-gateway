import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Model-matched visual builds (FID-2026-1104-013A).
 *
 * Everything lives under the `showcase` namespace so a failed import or a
 * withdrawn artifact cannot block catalog routing, credit settlement or content
 * feed ingestion. `model_id` and `catalog_digest` are deliberately not foreign
 * keys: a delisted model must make a binding stale, not cascade-delete the
 * historical review that explains why it was published.
 *
 * The schema is additive and every statement is idempotent. Assets are
 * content-addressed, so retrying a fetch stores no second copy.
 */
export async function showcaseSchema(db: PostgresDatabase) {
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS showcase;

    CREATE TABLE IF NOT EXISTS showcase.sources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('pelican_sdf', 'openrouter_artifacts')),
      label TEXT NOT NULL,
      base_url TEXT NOT NULL,
      revision TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      max_storage_bytes BIGINT NOT NULL DEFAULT 67108864,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS showcase.source_rights (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES showcase.sources(id) ON DELETE CASCADE,
      state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'withdrawn')),
      evidence_url TEXT NOT NULL,
      evidence_note TEXT NOT NULL,
      evidence_sha256 TEXT NOT NULL,
      license_text TEXT NOT NULL,
      license_sha256 TEXT NOT NULL,
      attribution TEXT NOT NULL,
      display_allowed INTEGER NOT NULL DEFAULT 0,
      cache_allowed INTEGER NOT NULL DEFAULT 0,
      redistribute_allowed INTEGER NOT NULL DEFAULT 0,
      reviewer TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      superseded_by TEXT REFERENCES showcase.source_rights(id),
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS showcase_source_rights_current_idx
      ON showcase.source_rights(source_id, state)
      WHERE superseded_by IS NULL AND state = 'approved';
    CREATE INDEX IF NOT EXISTS showcase_source_rights_source_idx
      ON showcase.source_rights(source_id, created_at DESC);

    ALTER TABLE showcase.sources DROP CONSTRAINT IF EXISTS showcase_sources_kind_check;
    ALTER TABLE showcase.sources ADD CONSTRAINT showcase_sources_kind_check
      CHECK (kind IN ('pelican_sdf', 'openrouter_artifacts'));

    CREATE TABLE IF NOT EXISTS showcase.import_runs (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES showcase.sources(id) ON DELETE CASCADE,
      owner_token TEXT NOT NULL,
      lease_expires_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'failed')),
      started_at TEXT NOT NULL,
      finished_at TEXT,
      seen INTEGER NOT NULL DEFAULT 0,
      imported INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS showcase_import_runs_source_idx
      ON showcase.import_runs(source_id, started_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS showcase_import_runs_running_idx
      ON showcase.import_runs(source_id)
      WHERE status = 'running';

    CREATE TABLE IF NOT EXISTS showcase.assets (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES showcase.sources(id) ON DELETE CASCADE,
      sha256 TEXT NOT NULL UNIQUE,
      mime TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('artifact', 'thumbnail')),
      bytes BYTEA NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS showcase_assets_source_idx
      ON showcase.assets(source_id);

    CREATE TABLE IF NOT EXISTS showcase.builds (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES showcase.sources(id) ON DELETE CASCADE,
      external_id TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'pending'
        CHECK (visibility IN ('pending', 'published', 'withdrawn')),
      published_revision_id TEXT,
      published_at TEXT,
      withdrawal_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (source_id, external_id)
    );
    CREATE INDEX IF NOT EXISTS showcase_builds_visibility_idx
      ON showcase.builds(visibility, updated_at DESC);

    CREATE TABLE IF NOT EXISTS showcase.revisions (
      id TEXT PRIMARY KEY,
      build_id TEXT NOT NULL REFERENCES showcase.builds(id) ON DELETE CASCADE,
      revision_key TEXT NOT NULL,
      source_id TEXT NOT NULL REFERENCES showcase.sources(id) ON DELETE CASCADE,
      source_url TEXT NOT NULL,
      source_revision TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      original_model_id TEXT NOT NULL,
      original_model_label TEXT NOT NULL,
      creator TEXT NOT NULL,
      provider TEXT NOT NULL,
      task TEXT NOT NULL,
      effort TEXT NOT NULL,
      harness TEXT NOT NULL,
      source_status TEXT NOT NULL,
      validation_state TEXT NOT NULL,
      source_created_at TEXT,
      prompt_text TEXT NOT NULL,
      prompt_sha256 TEXT NOT NULL,
      raw_record_json TEXT NOT NULL,
      raw_record_sha256 TEXT NOT NULL,
      cost_usd_micros BIGINT,
      generation_ms INTEGER,
      artifact_asset_id TEXT NOT NULL REFERENCES showcase.assets(id),
      thumbnail_asset_id TEXT REFERENCES showcase.assets(id),
      license_text TEXT NOT NULL,
      license_sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (build_id, revision_key),
      UNIQUE (id, build_id)
    );
    CREATE INDEX IF NOT EXISTS showcase_revisions_build_idx
      ON showcase.revisions(build_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS showcase.bindings (
      id TEXT PRIMARY KEY,
      revision_id TEXT NOT NULL REFERENCES showcase.revisions(id) ON DELETE CASCADE,
      model_id TEXT,
      state TEXT NOT NULL CHECK (state IN ('pending', 'accepted', 'rejected')),
      method TEXT NOT NULL CHECK (method IN ('exact_id', 'operator', 'suggested')),
      reason TEXT NOT NULL,
      catalog_digest TEXT NOT NULL,
      reviewer TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (revision_id)
    );
    CREATE INDEX IF NOT EXISTS showcase_bindings_model_idx
      ON showcase.bindings(model_id, state);

    CREATE TABLE IF NOT EXISTS showcase.model_aliases (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES showcase.sources(id) ON DELETE CASCADE,
      external_model_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
      reason TEXT NOT NULL,
      reviewer TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT,
      UNIQUE (source_id, external_model_id)
    );

    CREATE TABLE IF NOT EXISTS showcase.reviews (
      id TEXT PRIMARY KEY,
      revision_id TEXT NOT NULL REFERENCES showcase.revisions(id) ON DELETE CASCADE,
      decision TEXT NOT NULL CHECK (decision IN ('publish', 'withdraw', 'reject')),
      rights_sha256 TEXT NOT NULL,
      bundle_sha256 TEXT NOT NULL,
      binding_sha256 TEXT NOT NULL,
      reviewer TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS showcase_reviews_revision_idx
      ON showcase.reviews(revision_id, created_at DESC);
  `);
}
