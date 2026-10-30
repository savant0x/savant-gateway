import type { DatabaseHandle } from "./columns.ts";

import { ensureColumn } from "./columns.ts";

/**
 * Durable webhook state. Existing rows predate the state machine and are
 * treated as processed; a claim records its attempt, mode and failure reason so
 * a crash cannot suppress a payment forever.
 */
export function paymentEventSchema(database: DatabaseHandle) {
  ensureColumn(
    database,
    "billing_events",
    "status",
    "TEXT NOT NULL DEFAULT 'processed'",
  );
  ensureColumn(
    database,
    "billing_events",
    "attempts",
    "INTEGER NOT NULL DEFAULT 1",
  );
  ensureColumn(database, "billing_events", "livemode", "INTEGER");
  ensureColumn(database, "billing_events", "claimed_at", "TEXT");
  ensureColumn(database, "billing_events", "last_error", "TEXT");
}
