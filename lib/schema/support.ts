import type { DatabaseHandle } from "./columns";

/**
 * Customer support and data requests. Rows are durable and operator-visible:
 * the customer submits from an authenticated account, and only the operator can
 * resolve. No public form writes here.
 */
export function supportSchema(database: DatabaseHandle) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS support_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'resolved')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      resolution_note TEXT
    );
    CREATE INDEX IF NOT EXISTS support_requests_user_idx
      ON support_requests(user_id, created_at);
    CREATE INDEX IF NOT EXISTS support_requests_status_idx
      ON support_requests(status, created_at);
  `);
}
