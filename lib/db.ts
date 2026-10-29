import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import Database from "better-sqlite3";

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

function createDb() {
  const database = new Database(dbPath);

  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("busy_timeout = 5000");
  database.pragma("foreign_keys = ON");

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
    CREATE INDEX IF NOT EXISTS usage_events_created_idx ON usage_events(created_at);

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

  database
    .prepare(
      `INSERT OR IGNORE INTO users (id, email, name, status, created_at)
       VALUES ('user_dev', 'dev@local', 'Local Developer', 'active', ?)`,
    )
    .run(new Date().toISOString());

  database
    .prepare(
      "INSERT OR IGNORE INTO admin_state (id, session_epoch) VALUES (1, 0)",
    )
    .run();

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
