import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { reconcileRoutesIn } from "../lib/storage/store/routes.ts";

import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-31T12:00:00.000Z";
const ROUTE_UPDATE = "served_provider_slug = ?";

/**
 * Reconciliation writes only what changed (FID-2026-1124-005, slice 2).
 *
 * Every catalog edit ran `reconcileRoutes`, which updated every member of every
 * group regardless of whether the computed route differed. At catalog size one
 * operator click became rows(models) round trips inside a single transaction.
 * These cases assert the write count, not a duration.
 */
function counted(db) {
  const state = { writes: 0 };
  const handle = new Proxy(db, {
    get(target, key, receiver) {
      if (key === "prepare") {
        return (sql) => {
          const statement = target.prepare(sql);

          if (!sql.includes(ROUTE_UPDATE)) return statement;

          return new Proxy(statement, {
            get(source, property, inner) {
              const value = Reflect.get(source, property, inner);

              if (property !== "run") {
                return typeof value === "function" ? value.bind(source) : value;
              }

              return (...params) => {
                state.writes += 1;

                return source.run(...params);
              };
            },
          });
        };
      }

      const value = Reflect.get(target, key, receiver);

      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return { handle, state };
}

async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO model_groups
        (slug, label, billing_mode, sort_order, is_system, created_at, updated_at)
       VALUES ('paid', 'Paid', 'paid', 0, 0, ?, ?)
       ON CONFLICT (slug) DO NOTHING`,
    )
    .run(NOW, NOW);
  await db
    .prepare("UPDATE providers SET enabled = 1 WHERE slug = 'savant'")
    .run();

  for (const [id, upstream, cost] of [
    ["savant/a", "a", 1_000],
    ["savant/b", "b", 2_000],
    ["savant/c", "c", 3_000],
  ]) {
    await db
      .prepare(
        `INSERT INTO models
          (id, upstream_id, upstream_slug, name, provider, family, protocol,
           route_group, context_window, token_weight, in_catalog, group_slug,
           group_source, status, sort_order, synced_at, is_primary,
           cost_source, price_source, input_price_micros, output_price_micros,
           sell_input_micros, sell_output_micros)
         VALUES (?, ?, 'savant', ?, 'Family', 'Family', 'chat', 'r1', '8k', 1,
                 1, 'paid', 'auto', 'active', 0, ?, 0, 'manual', 'manual', ?, ?,
                 0, 0)`,
      )
      .run(id, upstream, upstream.toUpperCase(), NOW, cost, cost * 2);
  }

  return db;
}

test("a stable catalog is not rewritten, and one changed row writes once", async () => {
  const db = await fixture();

  try {
    await reconcileRoutesIn(db, 2_500);

    const { handle, state } = counted(db);

    await reconcileRoutesIn(handle, 2_500);

    assert.equal(state.writes, 0, "nothing changed, so nothing is written");

    const primary = await db
      .prepare("SELECT id, served_upstream_id FROM models WHERE is_primary = 1")
      .get();

    assert.ok(primary, "one row is published");

    await db
      .prepare("UPDATE models SET served_upstream_id = 'stale-route' WHERE id = ?")
      .run(primary.id);
    await reconcileRoutesIn(handle, 2_500);

    assert.equal(state.writes, 1, "only the row that differs is written");

    const restored = await db
      .prepare("SELECT served_upstream_id FROM models WHERE id = ?")
      .get(primary.id);

    assert.equal(
      restored.served_upstream_id,
      primary.served_upstream_id,
      "the stale snapshot is replaced by the computed one",
    );
  } finally {
    await db.close();
  }
});
