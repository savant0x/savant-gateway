import type { DatabaseHandle } from "./columns.ts";

/**
 * Durable settlement state. Amounts and reservation links are recorded before
 * dispatch; `status` only moves forward (admitted → committed/quarantined).
 */
export function settlementSchema(database: DatabaseHandle) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS settlements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      api_key_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      provider_slug TEXT NOT NULL,
      billing_source TEXT NOT NULL,
      credit_hold_id TEXT,
      free_reservation_id TEXT,
      subscription_hold_id TEXT,
      estimated_micros INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'admitted',
      detail TEXT,
      created_at TEXT NOT NULL,
      settled_at TEXT
    );
    CREATE INDEX IF NOT EXISTS settlements_status_idx
      ON settlements(status, created_at);
    CREATE INDEX IF NOT EXISTS settlements_user_idx
      ON settlements(user_id, created_at);

    CREATE TABLE IF NOT EXISTS quarantined_holds (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      user_id TEXT NOT NULL,
      api_key_id TEXT,
      model_id TEXT,
      period_id TEXT,
      reserved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      expired_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'quarantined',
      released_at TEXT,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS quarantined_holds_status_idx
      ON quarantined_holds(status, expired_at);
  `);
}
