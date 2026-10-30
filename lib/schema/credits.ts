import type { DatabaseHandle } from "./columns.ts";

import { ensureColumn } from "./columns.ts";

/**
 * Adjustment identity and legacy baselines. A reference names one financial
 * correction, so a retried request cannot credit the same refund twice.
 */
export function creditAdjustmentSchema(database: DatabaseHandle) {
  ensureColumn(database, "credit_ledger", "reference", "TEXT");
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_reference_idx
      ON credit_ledger(reference) WHERE reference IS NOT NULL;

    CREATE TABLE IF NOT EXISTS balance_baselines (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      baseline_micros INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS balance_baselines_user_idx
      ON balance_baselines(user_id, created_at);
  `);
}
