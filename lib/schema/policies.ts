import type { DatabaseHandle } from "./columns";

/**
 * One row per account and published policy version. The unique constraint makes
 * acceptance idempotent: a second acceptance of the same version is a no-op and
 * the original timestamp stands, so the record always shows when the customer
 * first agreed to the text that currently applies.
 */
export function policySchema(database: DatabaseHandle) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS policy_acceptances (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      version TEXT NOT NULL,
      source TEXT NOT NULL
        CHECK (source IN ('signup', 'account')),
      accepted_at TEXT NOT NULL,
      UNIQUE (user_id, version)
    );
    CREATE INDEX IF NOT EXISTS policy_acceptances_version_idx
      ON policy_acceptances(version, accepted_at);
  `);
}
