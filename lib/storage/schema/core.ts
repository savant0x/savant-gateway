import type { PostgresDatabase } from "../pg-adapter.ts";

import { ensureColumn } from "./columns.ts";

/**
 * Core tables: identity, catalog rows, request records and prepaid credit.
 * Ported from `lib/db.ts` and `lib/schema/*` for FID-2026-1031-085 step 2.
 *
 * Translation rules, applied to every module in this directory:
 *
 * 1. **Money and token counts are `BIGINT`.** SQLite `INTEGER` is 64-bit; int4
 *    would narrow a balance silently.
 * 2. **Timestamps stay `TEXT` in ISO-8601 UTC.** Lexicographic order equals
 *    chronological order for that format, so every existing `ORDER BY` and
 *    range comparison keeps its meaning and no return shape changes. The 30
 *    `datetime()` expressions take an explicit `::timestamptz` cast when the
 *    store layer is ported (step 4).
 * 3. **`INSERT OR IGNORE` becomes `ON CONFLICT DO NOTHING`.**
 * 4. **`COLLATE NOCASE UNIQUE` becomes a unique index on `lower(...)`.**
 * 5. **`REAL` becomes `double precision`**, which is what `REAL` already meant.
 */
export async function coreSchema(db: PostgresDatabase) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      secret_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      last_used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys(user_id);

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      upstream_id TEXT NOT NULL,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      context_window TEXT NOT NULL,
      token_weight INTEGER NOT NULL DEFAULT 0,
      input_price_micros BIGINT NOT NULL DEFAULT 0,
      output_price_micros BIGINT NOT NULL DEFAULT 0,
      allow_free INTEGER NOT NULL DEFAULT 0,
      supports_tools INTEGER NOT NULL DEFAULT 0,
      supports_vision INTEGER NOT NULL DEFAULT 0,
      health TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      sort_order INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
      model_id TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      weighted_tokens INTEGER NOT NULL DEFAULT 0,
      cost_micros BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS usage_events_created_idx
      ON usage_events(created_at);

    CREATE TABLE IF NOT EXISTS admin_state (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      session_epoch INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS provider_status (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
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
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_holds (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
      model_id TEXT NOT NULL,
      hold_micros BIGINT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS credit_holds_user_idx ON credit_holds(user_id);
    CREATE INDEX IF NOT EXISTS credit_holds_expiry_idx
      ON credit_holds(expires_at);

    CREATE TABLE IF NOT EXISTS credit_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      amount_micros BIGINT NOT NULL,
      balance_after_micros BIGINT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS credit_ledger_user_idx
      ON credit_ledger(user_id, created_at);

    CREATE TABLE IF NOT EXISTS balance_baselines (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      baseline_micros BIGINT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS balance_baselines_user_idx
      ON balance_baselines(user_id, created_at);
  `);

  // Columns added after the first production-shaped schema. Additive, and each
  // one is a no-op on a database that already has it.
  for (const [column, definition] of [
    ["sell_input_micros", "BIGINT NOT NULL DEFAULT 0"],
    ["sell_output_micros", "BIGINT NOT NULL DEFAULT 0"],
    ["price_source", "TEXT NOT NULL DEFAULT 'auto'"],
    ["in_catalog", "INTEGER NOT NULL DEFAULT 1"],
  ] as const) {
    await ensureColumn(db, "models", column, definition);
  }

  for (const [column, definition] of [
    ["credit_micros", "BIGINT NOT NULL DEFAULT 0"],
    ["held_micros", "BIGINT NOT NULL DEFAULT 0"],
    ["password_hash", "TEXT"],
    ["email_verified_at", "TEXT"],
    ["last_login_at", "TEXT"],
    ["stripe_customer_id", "TEXT"],
  ] as const) {
    await ensureColumn(db, "users", column, definition);
  }

  for (const [column, definition] of [
    ["charged_micros", "BIGINT NOT NULL DEFAULT 0"],
    ["estimated", "INTEGER NOT NULL DEFAULT 0"],
  ] as const) {
    await ensureColumn(db, "usage_events", column, definition);
  }

  await ensureColumn(db, "credit_ledger", "reference", "TEXT");

  // These two indexes name columns added just above, so they cannot be created
  // with the table script. PostgreSQL resolves index columns at creation time
  // and fails with 42703 if the column does not exist yet — which is how this
  // ordering was found.
  await db.exec(`
    CREATE INDEX IF NOT EXISTS models_catalog_idx
      ON models(in_catalog, status);
    CREATE INDEX IF NOT EXISTS usage_events_model_idx
      ON usage_events(model_id, created_at);

    CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer_idx
      ON users(stripe_customer_id)
      WHERE stripe_customer_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_reference_idx
      ON credit_ledger(reference)
      WHERE reference IS NOT NULL;
  `);

  // One-time backfill for rows created before sell prices existed. Rows with
  // price_source = 'manual' are never touched.
  await db
    .prepare(
      `UPDATE models
          SET sell_input_micros = CASE
                WHEN allow_free = 1 OR input_price_micros <= 0 THEN 0
                ELSE GREATEST(1, ROUND(input_price_micros * 1.25)::bigint)
              END,
              sell_output_micros = CASE
                WHEN allow_free = 1 OR output_price_micros <= 0 THEN 0
                ELSE GREATEST(1, ROUND(output_price_micros * 1.25)::bigint)
              END
        WHERE price_source = 'auto'
          AND sell_input_micros = 0
          AND sell_output_micros = 0`,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('pricing.markup_bps', '2500', ?)
       ON CONFLICT DO NOTHING`,
    )
    .run(new Date().toISOString());

  await db
    .prepare(
      `INSERT INTO admin_state (id, session_epoch) VALUES (1, 0)
       ON CONFLICT DO NOTHING`,
    )
    .run();
}
