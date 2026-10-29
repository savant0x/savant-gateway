import type { DatabaseHandle } from "./columns";

import { ensureColumn, hasColumn } from "./columns";

/**
 * Provider registry plus the model and usage columns that carry upstream
 * identity. Additive only: existing rows are backfilled to the default
 * provider so a single-upstream deployment keeps working unchanged.
 */
export function providerSchema(database: DatabaseHandle) {
  database.exec(`
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
      balance_usd REAL,
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
  `);

  ensureColumn(
    database,
    "models",
    "upstream_slug",
    "TEXT NOT NULL DEFAULT 'savant'",
  );
  ensureColumn(database, "models", "family", "TEXT");
  ensureColumn(database, "models", "protocol", "TEXT NOT NULL DEFAULT 'chat'");
  ensureColumn(
    database,
    "models",
    "cost_source",
    "TEXT NOT NULL DEFAULT 'unknown'",
  );
  ensureColumn(
    database,
    "usage_events",
    "provider_slug",
    "TEXT NOT NULL DEFAULT 'savant'",
  );

  database.exec(`
    UPDATE models SET family = provider WHERE family IS NULL OR family = '';
    UPDATE models
    SET cost_source = CASE
      WHEN allow_free = 1 AND token_weight > 0 THEN 'synced'
      WHEN input_price_micros > 0 OR output_price_micros > 0 THEN 'synced'
      ELSE 'unknown'
    END
    WHERE cost_source = 'unknown';
  `);

  if (
    hasColumn(database, "free_pool_reservations", "provider_slug") === false
  ) {
    database.exec(
      "ALTER TABLE free_pool_reservations ADD COLUMN provider_slug TEXT NOT NULL DEFAULT 'savant'",
    );
  }

  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS models_upstream_idx
      ON models(upstream_slug, upstream_id);
    CREATE INDEX IF NOT EXISTS models_upstream_catalog_idx
      ON models(upstream_slug, in_catalog, status);
  `);

  seedProviders(database);
}

/**
 * The default provider inherits the legacy environment triple and status row.
 * CommandCode is registered up front but stays unconfigured until its key is
 * present, so adding the registry changes no behavior on its own.
 */
function seedProviders(database: DatabaseHandle) {
  const now = new Date().toISOString();
  const legacy = database
    .prepare("SELECT * FROM provider_status WHERE id = 1")
    .get() as Record<string, unknown> | undefined;
  const baseUrl =
    process.env.PROVIDER_BASE_URL?.trim() || "https://api.apinex.bond/v1";

  database
    .prepare(
      `INSERT OR IGNORE INTO providers
        (slug, label, kind, base_url, key_env_var, default_headers,
         supports_balance, supports_subscription, supports_pricing, enabled,
         sort_order, status, balance_usd, rpm, rpm_plan, subscription_mode,
         subscription_plan, subscription_token_limit,
         subscription_tokens_used, subscription_tokens_remaining,
         subscription_allowed, subscription_expires_at, synced_at, error,
         created_at, updated_at)
       VALUES ('savant', 'Savant', 'openai', ?, 'PROVIDER_KEY', ?, 1, 1, 1, 1,
               10, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      baseUrl.replace(/\/+$/, ""),
      JSON.stringify({ src: "gate" }),
      String(legacy?.status ?? "unconfigured"),
      legacy?.balance_usd ?? null,
      legacy?.rpm ?? null,
      legacy?.rpm_plan ?? null,
      legacy?.subscription_mode ?? null,
      legacy?.subscription_plan ?? null,
      legacy?.subscription_token_limit ?? null,
      legacy?.subscription_tokens_used ?? null,
      legacy?.subscription_tokens_remaining ?? null,
      legacy?.subscription_allowed ?? null,
      legacy?.subscription_expires_at ?? null,
      legacy?.synced_at ?? null,
      legacy?.error ?? null,
      now,
      now,
    );

  database
    .prepare(
      `INSERT OR IGNORE INTO providers
        (slug, label, kind, base_url, key_env_var, default_headers,
         supports_balance, supports_subscription, supports_pricing, enabled,
         sort_order, status, created_at, updated_at)
       VALUES ('commandcode', 'CommandCode', 'both',
               'https://api.commandcode.ai/provider/v1',
               'COMMANDCODE_API_KEY', '{}', 0, 0, 0, 1, 20,
               'unconfigured', ?, ?)`,
    )
    .run(now, now);
}
