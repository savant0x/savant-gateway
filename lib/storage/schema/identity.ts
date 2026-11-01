import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Identity evidence tables (FID-2026-1101-087).
 *
 * The schema is deliberately isolated from the billing and customer tables:
 * no foreign key crosses the `identity` namespace. A failed probe run therefore
 * cannot hold a ledger row or a customer request hostage.
 *
 * Every statement is idempotent so the additive migration can run on every
 * boot. The partial unique index is what makes "one active run per target" a
 * database rule rather than a handler convention.
 */
export async function identitySchema(db: PostgresDatabase) {
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS identity;

    CREATE TABLE IF NOT EXISTS identity.protocols (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      probe_sha256 TEXT NOT NULL,
      system_prompt_sha256 TEXT NOT NULL,
      battery_json TEXT NOT NULL,
      sampling_json TEXT NOT NULL,
      normalizer_version TEXT NOT NULL,
      sealed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS identity.references (
      id TEXT PRIMARY KEY,
      canonical_model_key TEXT NOT NULL,
      protocol_id TEXT NOT NULL REFERENCES identity.protocols(id),
      provider_slug TEXT NOT NULL,
      upstream_id TEXT NOT NULL,
      collected_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      counts_json TEXT NOT NULL,
      n_per_cell INTEGER NOT NULL,
      content_sha256 TEXT NOT NULL,
      run_id TEXT
    );
    CREATE INDEX IF NOT EXISTS identity_references_match_idx
      ON identity.references(canonical_model_key, protocol_id, expires_at);

    CREATE TABLE IF NOT EXISTS identity.runs (
      id TEXT PRIMARY KEY,
      target_model_id TEXT NOT NULL,
      target_name TEXT NOT NULL,
      canonical_model_key TEXT NOT NULL,
      provider_slug TEXT NOT NULL,
      upstream_id TEXT NOT NULL,
      target_json TEXT NOT NULL,
      provider_json TEXT NOT NULL,
      protocol_id TEXT NOT NULL REFERENCES identity.protocols(id),
      reference_id TEXT REFERENCES identity.references(id),
      control_model_id TEXT,
      control_provider_slug TEXT,
      control_upstream_id TEXT,
      control_json TEXT,
      mode TEXT NOT NULL CHECK (mode IN ('baseline','verify')),
      status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled','interrupted')),
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      estimate_json TEXT NOT NULL,
      actual_json TEXT,
      coverage_json TEXT,
      error_class TEXT,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS identity_runs_active_target_idx
      ON identity.runs(target_model_id)
      WHERE status IN ('queued','running');

    CREATE TABLE IF NOT EXISTS identity.samples (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES identity.runs(id) ON DELETE CASCADE,
      probe_id TEXT NOT NULL,
      arm TEXT NOT NULL CHECK (arm IN ('target','diff_control')),
      iteration INTEGER NOT NULL,
      http_status INTEGER NOT NULL,
      model_field TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      response_sha256 TEXT NOT NULL,
      response_excerpt TEXT NOT NULL,
      top_logprobs_json TEXT,
      latency_ms INTEGER,
      error_class TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS identity_samples_key_idx
      ON identity.samples(run_id, probe_id, arm, iteration);
    CREATE INDEX IF NOT EXISTS identity_samples_run_idx
      ON identity.samples(run_id, arm);

    CREATE TABLE IF NOT EXISTS identity.findings (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES identity.runs(id) ON DELETE CASCADE,
      class TEXT NOT NULL,
      metric TEXT NOT NULL,
      observed TEXT,
      threshold TEXT,
      n INTEGER NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('pass','fail','inconclusive','not_tested','suspect')),
      evidence_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS identity_findings_key_idx
      ON identity.findings(run_id, class, metric);

    CREATE TABLE IF NOT EXISTS identity.verdicts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL UNIQUE REFERENCES identity.runs(id) ON DELETE CASCADE,
      target_model_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('baseline','self_consistent','consistent','inconclusive','divergent_review','mismatch_confirmed','unsupported','stale','error')),
      summary TEXT NOT NULL,
      claims_json TEXT NOT NULL,
      limits_json TEXT NOT NULL,
      coverage_json TEXT NOT NULL,
      tested_at TEXT NOT NULL,
      valid_until TEXT NOT NULL,
      published INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      published_by TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS identity_verdicts_public_idx
      ON identity.verdicts(target_model_id, published, tested_at DESC);

    CREATE TABLE IF NOT EXISTS identity.corrections (
      id TEXT PRIMARY KEY,
      target_model_id TEXT NOT NULL,
      run_id TEXT,
      status_before TEXT,
      status_after TEXT,
      reason TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      operator_note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS identity_corrections_model_idx
      ON identity.corrections(target_model_id, created_at DESC);
  `);
}
