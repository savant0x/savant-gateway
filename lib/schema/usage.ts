import type { DatabaseHandle } from "./columns.ts";

import { ensureColumn } from "./columns.ts";

/**
 * Additive usage fidelity columns. Existing rows keep NULL components and a
 * NULL source: their provenance was never recorded, and a default of "reported"
 * would claim provider data that was never captured.
 */
export function usageFidelitySchema(database: DatabaseHandle) {
  ensureColumn(database, "usage_events", "cached_input_tokens", "INTEGER");
  ensureColumn(database, "usage_events", "cache_write_input_tokens", "INTEGER");
  ensureColumn(database, "usage_events", "reasoning_output_tokens", "INTEGER");
  ensureColumn(database, "usage_events", "usage_source", "TEXT");
}
