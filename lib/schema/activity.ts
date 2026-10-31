import type { DatabaseHandle } from "./columns.ts";

/**
 * Append-only business lifecycle events. Request-level records stay in
 * usage_events; this table answers "what happened to this account" without
 * joining five feature tables.
 */
export function activitySchema(database: DatabaseHandle) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      actor TEXT NOT NULL DEFAULT 'system',
      kind TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS activity_events_user_idx
      ON activity_events(user_id, created_at);
    CREATE INDEX IF NOT EXISTS activity_events_kind_idx
      ON activity_events(kind, created_at);
  `);
}
