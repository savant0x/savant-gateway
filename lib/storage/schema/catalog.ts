import type { PostgresDatabase } from "../pg-adapter.ts";

import { ensureColumn } from "./columns.ts";
import { catalogSeeds } from "./catalog-seeds.ts";

/**
 * Catalog tables: the provider registry, model groups, benchmarks, and the
 * provider/route/group columns that carry catalog identity. Ported from
 * `lib/schema/*` for FID-085 step 2.
 *
 * The backfills are the same one-time, idempotent statements the SQLite schema
 * runs: they rewrite only rows that match a legacy shape, so a second boot
 * changes nothing.
 */
export async function catalogSchema(db: PostgresDatabase) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      slug TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'openai',
      base_url TEXT NOT NULL,
      key_env_var TEXT NOT NULL,
      default_headers TEXT NOT NULL DEFAULT '{}',
      supports_balance INTEGER NOT NULL DEFAULT 0,
      supports_subscription INTEGER NOT NULL DEFAULT 0,
      supports_pricing INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unconfigured',
      balance_usd DOUBLE PRECISION,
      rpm INTEGER,
      rpm_plan TEXT,
      subscription_mode TEXT,
      subscription_plan TEXT,
      subscription_token_limit INTEGER,
      subscription_tokens_used INTEGER,
      subscription_tokens_remaining INTEGER,
      subscription_allowed INTEGER,
      subscription_expires_at TEXT,
      synced_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_groups (
      slug TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      billing_mode TEXT NOT NULL
        CHECK (billing_mode IN ('free', 'paid', 'subscription')),
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_benchmarks (
      model_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_id TEXT,
      source_slug TEXT,
      intelligence_index DOUBLE PRECISION,
      index_version TEXT,
      output_tokens_per_second DOUBLE PRECISION,
      ttft_seconds DOUBLE PRECISION,
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

    CREATE TABLE IF NOT EXISTS provider_sync_leases (
      slug TEXT PRIMARY KEY,
      owner_token TEXT NOT NULL,
      claimed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS provider_sync_leases_expiry_idx
      ON provider_sync_leases(expires_at);
  `);

  // `COLLATE NOCASE UNIQUE` has no direct equivalent; a unique index on
  // lower(label) keeps the case-insensitive guarantee.
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS model_groups_label_key
      ON model_groups (lower(label));
    CREATE INDEX IF NOT EXISTS model_groups_order_idx
      ON model_groups(sort_order, label);
  `);

  await providerColumns(db);
  await routeColumns(db);
  await groupColumns(db);
  await benchmarkColumns(db);

  await catalogSeeds(db);
}

async function providerColumns(db: PostgresDatabase) {
  for (const [column, definition] of [
    ["balance_observed_at", "TEXT"],
    ["quota_observed_at", "TEXT"],
    ["quota_checked_at", "TEXT"],
    ["quota_reset_at", "TEXT"],
    ["quota_unlimited", "INTEGER NOT NULL DEFAULT 0"],
    ["quota_error", "TEXT"],
    ["runtime_lease_id", "TEXT"],
    ["runtime_lease_until", "TEXT"],
  ] as const) {
    await ensureColumn(db, "providers", column, definition);
  }

  for (const [column, definition] of [
    ["upstream_slug", "TEXT NOT NULL DEFAULT 'savant'"],
    ["family", "TEXT"],
    ["protocol", "TEXT NOT NULL DEFAULT 'chat'"],
    ["cost_source", "TEXT NOT NULL DEFAULT 'unknown'"],
    ["cost_observed_at", "TEXT"],
  ] as const) {
    await ensureColumn(db, "models", column, definition);
  }

  await ensureColumn(
    db,
    "usage_events",
    "provider_slug",
    "TEXT NOT NULL DEFAULT 'savant'",
  );

  // A legacy row without a sync time keeps a null observation and is treated as
  // fresh until its cost is re-entered.
  await db
    .prepare(
      `UPDATE models SET cost_observed_at = synced_at
        WHERE cost_observed_at IS NULL AND synced_at IS NOT NULL`,
    )
    .run();

  await db
    .prepare(
      `UPDATE models SET family = provider WHERE family IS NULL OR family = ''`,
    )
    .run();

  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS models_upstream_idx
      ON models(upstream_slug, upstream_id);
    CREATE INDEX IF NOT EXISTS models_upstream_catalog_idx
      ON models(upstream_slug, in_catalog, status);
  `);
}

async function routeColumns(db: PostgresDatabase) {
  for (const [column, definition] of [
    ["route_group", "TEXT"],
    ["is_primary", "INTEGER NOT NULL DEFAULT 1"],
    ["served_provider_slug", "TEXT"],
    ["served_upstream_id", "TEXT"],
    ["served_protocol", "TEXT"],
    ["served_cost_input_micros", "BIGINT"],
    ["served_cost_output_micros", "BIGINT"],
  ] as const) {
    await ensureColumn(db, "models", column, definition);
  }

  await db.exec(`
    CREATE INDEX IF NOT EXISTS models_route_group_idx
      ON models(route_group, is_primary);
  `);
}

async function groupColumns(db: PostgresDatabase) {
  await ensureColumn(
    db,
    "model_groups",
    "hidden",
    "INTEGER NOT NULL DEFAULT 0",
  );
  await ensureColumn(db, "models", "group_slug", "TEXT");
  await ensureColumn(
    db,
    "models",
    "group_source",
    "TEXT NOT NULL DEFAULT 'auto' CHECK (group_source IN ('auto', 'manual'))",
  );
  await ensureColumn(db, "usage_events", "group_slug", "TEXT");

  await db.exec(`
    CREATE INDEX IF NOT EXISTS models_group_idx ON models(group_slug);
  `);
}

async function benchmarkColumns(db: PostgresDatabase) {
  for (const [column, definition] of [
    ["coding_index", "DOUBLE PRECISION"],
    ["agentic_index", "DOUBLE PRECISION"],
    ["end_to_end_seconds", "DOUBLE PRECISION"],
    ["release_date", "TEXT"],
  ] as const) {
    await ensureColumn(db, "model_benchmarks", column, definition);
  }
}
