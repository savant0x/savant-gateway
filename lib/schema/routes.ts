import type { DatabaseHandle } from "./columns.ts";

import { canonicalModelKey } from "../model-identity.ts";

import { ensureColumn } from "./columns.ts";

/**
 * Provider routing columns. `route_group` is the provider-neutral identity that
 * lets the same model from two providers be one published catalog row;
 * `served_*` records which route actually answers it, so a published price and
 * the recorded upstream cost cannot drift apart after a cheaper provider wins.
 *
 * Additive: an existing single-provider database keeps every row published and
 * served by itself.
 */
export function routeSchema(database: DatabaseHandle) {
  ensureColumn(database, "models", "route_group", "TEXT");
  ensureColumn(database, "models", "is_primary", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database, "models", "served_provider_slug", "TEXT");
  ensureColumn(database, "models", "served_upstream_id", "TEXT");
  ensureColumn(database, "models", "served_protocol", "TEXT");
  ensureColumn(database, "models", "served_cost_input_micros", "INTEGER");
  ensureColumn(database, "models", "served_cost_output_micros", "INTEGER");

  database.exec(`
    CREATE INDEX IF NOT EXISTS models_route_group_idx
      ON models(route_group, is_primary);
  `);
}

/** One-time fill for rows that predate the routing columns. Idempotent. */
export function backfillRouteGroups(database: DatabaseHandle) {
  const rows = database
    .prepare(
      "SELECT id, upstream_id FROM models WHERE route_group IS NULL OR route_group = ''",
    )
    .all() as Array<{ id: string; upstream_id: string }>;

  if (rows.length === 0) return;

  const update = database.prepare(
    "UPDATE models SET route_group = ? WHERE id = ?",
  );

  database.transaction(() => {
    for (const row of rows) {
      update.run(canonicalModelKey(row.upstream_id), row.id);
    }
  })();
}
