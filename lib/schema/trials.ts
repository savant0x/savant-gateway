import type { DatabaseHandle } from "./columns";

import { ensureColumn } from "./columns.ts";

export function trialSchema(database: DatabaseHandle) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS trial_grants (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      granted_tokens INTEGER NOT NULL CHECK(granted_tokens >= 0),
      used_tokens INTEGER NOT NULL DEFAULT 0 CHECK(used_tokens >= 0),
      issued_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trial_reservations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES trial_grants(user_id) ON DELETE CASCADE,
      reserved_tokens INTEGER NOT NULL CHECK(reserved_tokens >= 0),
      actual_tokens INTEGER,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      settled_at TEXT
    );
    CREATE INDEX IF NOT EXISTS trial_reservations_user_idx
      ON trial_reservations(user_id, settled_at, expires_at);
  `);
  ensureColumn(database, "usage_events", "serving_upstream_id", "TEXT");
}
