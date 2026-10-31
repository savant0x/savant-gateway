import type { DatabaseHandle } from "./columns.ts";

/**
 * Durable incident records are the audit trail for operator alerts. A row is
 * deduplicated by fingerprint, survives restarts, and records delivery
 * separately from condition state: a resolved condition still needs a recovery
 * delivery, and a failed delivery must remain visible instead of being retried
 * invisibly forever.
 */
export function operationsSchema(database: DatabaseHandle) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS operations_incidents (
      id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL UNIQUE,
      severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'resolved')),
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      acknowledged_at TEXT,
      resolved_at TEXT,
      delivery_kind TEXT NOT NULL DEFAULT 'alert'
        CHECK (delivery_kind IN ('alert', 'recovery')),
      delivery_state TEXT NOT NULL DEFAULT 'pending'
        CHECK (delivery_state IN ('unconfigured', 'pending', 'delivered', 'failed')),
      delivery_attempts INTEGER NOT NULL DEFAULT 0,
      last_delivery_at TEXT,
      next_attempt_at TEXT,
      last_delivery_error TEXT
    );
    CREATE INDEX IF NOT EXISTS operations_incidents_status_idx
      ON operations_incidents(status, severity, last_seen);
    CREATE INDEX IF NOT EXISTS operations_incidents_delivery_idx
      ON operations_incidents(delivery_state, next_attempt_at);
  `);
}
