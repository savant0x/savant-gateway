import type { DatabaseHandle } from "./columns";

export function accountActionSchema(database: DatabaseHandle) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS account_actions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      delivery_state TEXT NOT NULL DEFAULT 'pending'
        CHECK (delivery_state IN ('pending', 'sent', 'failed'))
    );
    CREATE INDEX IF NOT EXISTS account_actions_user_idx
      ON account_actions(user_id, purpose, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS account_actions_active_idx
      ON account_actions(user_id, purpose) WHERE consumed_at IS NULL;
  `);
}
