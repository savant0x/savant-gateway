import type { DatabaseHandle } from "./columns.ts";

/**
 * Indexes introduced after the first production-shaped schema. The payment
 * claim index is low-write because billing events are rare. A provider-scoped
 * usage composite was measured and deliberately not added: it costs one write
 * per settlement, while the existing created_at index already bounds the day
 * window and filters provider_slug cheaply. All statements are additive and
 * safe on every boot.
 */
export function performanceIndexSchema(database: DatabaseHandle) {
  database.exec(`
    CREATE INDEX IF NOT EXISTS billing_events_status_claimed_idx
      ON billing_events(status, claimed_at);
  `);
}
