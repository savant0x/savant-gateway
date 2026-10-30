import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import Database from "better-sqlite3";

import { normalizeFamilyName } from "./model-family";
import { allocationSchema } from "./schema/allocations";
import { benchmarkSchema } from "./schema/benchmarks";
import { ensureColumn, type DatabaseHandle } from "./schema/columns";
import { modelGroupSchema } from "./schema/groups";
import { providerSchema } from "./schema/providers";
import { subscriptionSchema } from "./schema/subscriptions";
import { creditAdjustmentSchema } from "./schema/credits";
import { settlementSchema } from "./schema/settlements";
import { trialSchema } from "./schema/trials";
import { usageFidelitySchema } from "./schema/usage";

const configuredDbPath = process.env.DB_PATH?.trim();

export const dbPath =
  configuredDbPath === ":memory:"
    ? ":memory:"
    : configuredDbPath
      ? resolve(/* turbopackIgnore: true */ configuredDbPath)
      : join(process.cwd(), "data", "gateway.db");

if (dbPath !== ":memory:") {
  mkdirSync(dirname(dbPath), { recursive: true });
}

type GlobalDb = typeof globalThis & { gatewayDb?: Database.Database };

function baseSchema(database: DatabaseHandle) {
  database.exec(`
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
      input_price_micros INTEGER NOT NULL DEFAULT 0,
      output_price_micros INTEGER NOT NULL DEFAULT 0,
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
      cost_micros INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS usage_events_created_idx
      ON usage_events(created_at);

    CREATE TABLE IF NOT EXISTS admin_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      session_epoch INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS provider_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
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
      error TEXT
    );
  `);
}

function v2Schema(database: DatabaseHandle) {
  ensureColumn(
    database,
    "models",
    "sell_input_micros",
    "INTEGER NOT NULL DEFAULT 0",
  );
  ensureColumn(
    database,
    "models",
    "sell_output_micros",
    "INTEGER NOT NULL DEFAULT 0",
  );
  ensureColumn(
    database,
    "models",
    "price_source",
    "TEXT NOT NULL DEFAULT 'auto'",
  );
  ensureColumn(database, "models", "in_catalog", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(
    database,
    "users",
    "credit_micros",
    "INTEGER NOT NULL DEFAULT 0",
  );
  ensureColumn(database, "users", "held_micros", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(
    database,
    "usage_events",
    "charged_micros",
    "INTEGER NOT NULL DEFAULT 0",
  );
  ensureColumn(
    database,
    "usage_events",
    "estimated",
    "INTEGER NOT NULL DEFAULT 0",
  );

  database.exec(`
    CREATE INDEX IF NOT EXISTS models_catalog_idx
      ON models(in_catalog, status);
    CREATE INDEX IF NOT EXISTS usage_events_model_idx
      ON usage_events(model_id, created_at);

    CREATE TABLE IF NOT EXISTS credit_holds (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
      model_id TEXT NOT NULL,
      hold_micros INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS credit_holds_user_idx ON credit_holds(user_id);
    CREATE INDEX IF NOT EXISTS credit_holds_expiry_idx ON credit_holds(expires_at);

    CREATE TABLE IF NOT EXISTS credit_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      amount_micros INTEGER NOT NULL,
      balance_after_micros INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS credit_ledger_user_idx
      ON credit_ledger(user_id, created_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // One-time backfill for rows created before sell prices existed. Rows with
  // price_source='manual' are never touched.
  database
    .prepare(
      `UPDATE models
       SET sell_input_micros = CASE
             WHEN allow_free = 1 OR input_price_micros <= 0 THEN 0
             ELSE MAX(1, CAST(ROUND(input_price_micros * 1.3) AS INTEGER))
           END,
           sell_output_micros = CASE
             WHEN allow_free = 1 OR output_price_micros <= 0 THEN 0
             ELSE MAX(1, CAST(ROUND(output_price_micros * 1.3) AS INTEGER))
           END
       WHERE price_source = 'auto'
         AND sell_input_micros = 0
         AND sell_output_micros = 0`,
    )
    .run();

  database
    .prepare(
      `INSERT OR IGNORE INTO settings (key, value, updated_at)
       VALUES ('pricing.markup_bps', '3000', ?)`,
    )
    .run(new Date().toISOString());
}

/** Rewrites legacy rows where the upstream price-group sentinel leaked into
 * the family column. Idempotent: after the first boot no row matches. */
function normalizeLegacyFamilies(database: DatabaseHandle) {
  const rows = database
    .prepare(
      "SELECT id, provider FROM models WHERE lower(trim(provider)) IN ('free', '')",
    )
    .all() as Array<{ id: string; provider: string }>;

  if (rows.length === 0) return;

  const update = database.prepare(
    "UPDATE models SET provider = ? WHERE id = ?",
  );

  database.transaction(() => {
    for (const row of rows) {
      update.run(normalizeFamilyName(row.id, row.provider), row.id);
    }
  })();
}

function customerSchema(database: DatabaseHandle) {
  ensureColumn(database, "users", "password_hash", "TEXT");
  ensureColumn(database, "users", "email_verified_at", "TEXT");
  ensureColumn(database, "users", "last_login_at", "TEXT");

  database.exec(`
    CREATE INDEX IF NOT EXISTS usage_events_user_idx
      ON usage_events(user_id, created_at);

    CREATE TABLE IF NOT EXISTS customer_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS customer_sessions_user_idx
      ON customer_sessions(user_id, expires_at);

    CREATE TABLE IF NOT EXISTS topups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'stripe',
      provider_ref TEXT NOT NULL UNIQUE,
      amount_micros INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      paid_at TEXT
    );
    CREATE INDEX IF NOT EXISTS topups_user_idx ON topups(user_id, created_at);
    CREATE INDEX IF NOT EXISTS topups_status_idx ON topups(status, created_at);
  `);
}

function freePoolSchema(database: DatabaseHandle) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS free_pool_usage (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      weighted_tokens INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, day)
    );

    CREATE TABLE IF NOT EXISTS free_pool_reservations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
      model_id TEXT NOT NULL,
      day TEXT NOT NULL,
      weighted_tokens INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS free_pool_reservations_user_idx
      ON free_pool_reservations(user_id, day);
    CREATE INDEX IF NOT EXISTS free_pool_reservations_expiry_idx
      ON free_pool_reservations(expires_at);
  `);
}

function seed(database: DatabaseHandle) {
  const now = new Date().toISOString();

  database
    .prepare(
      `INSERT OR IGNORE INTO users (id, email, name, status, created_at)
       VALUES ('user_dev', 'dev@local', 'Local Developer', 'active', ?)`,
    )
    .run(now);

  database
    .prepare(
      "INSERT OR IGNORE INTO admin_state (id, session_epoch) VALUES (1, 0)",
    )
    .run();
}

function createDb() {
  const database = new Database(dbPath);

  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("busy_timeout = 5000");
  database.pragma("foreign_keys = ON");

  baseSchema(database);
  v2Schema(database);
  customerSchema(database);
  freePoolSchema(database);
  allocationSchema(database);
  providerSchema(database);
  modelGroupSchema(database);
  subscriptionSchema(database);
  trialSchema(database);
  benchmarkSchema(database);
  usageFidelitySchema(database);
  settlementSchema(database);
  creditAdjustmentSchema(database);
  normalizeLegacyFamilies(database);
  seed(database);

  return database;
}

const globalForDb = globalThis as GlobalDb;

export const db = globalForDb.gatewayDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.gatewayDb = db;
}

export function nowIso() {
  return new Date().toISOString();
}
