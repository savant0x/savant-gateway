import type { DatabaseHandle } from "./columns";

/**
 * One row per activated account per UTC day. The row records the allocation
 * the gateway granted, not usage: usage stays in `free_pool_usage` and in-flight
 * holds stay in `free_pool_reservations`.
 */
export function allocationSchema(database: DatabaseHandle) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS free_pool_allocations (
      day TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      allocated_tokens INTEGER NOT NULL CHECK(allocated_tokens >= 0),
      created_at TEXT NOT NULL,
      PRIMARY KEY (day, user_id)
    );
    CREATE INDEX IF NOT EXISTS free_pool_allocations_day_idx
      ON free_pool_allocations(day);
  `);
}
