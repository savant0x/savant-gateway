import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  clearPublicCatalogCache,
  listModels,
} from "../lib/storage/store/catalog.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = new Date().toISOString();
const STALE = "2020-01-01T00:00:00.000Z";

/**
 * The publication gate on the target engine.
 *
 * This is the highest-consequence predicate in the catalog: it decides which
 * rows a customer can see, and every row it lets through is a row the gateway
 * must be able to price. So the tests are written as withhold/publish pairs —
 * each guard is shown refusing a row *and* admitting the same row once the
 * condition is satisfied, which is what distinguishes a working gate from one
 * that simply hides everything.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO providers (slug, label, base_url, key_env_var, enabled, created_at, updated_at)
       VALUES ('p1', 'Provider One', 'https://example.test', 'P1_KEY', 1, ?, ?)`,
    )
    .run(NOW, NOW);

  // The migration seeds the three system groups with `ON CONFLICT DO NOTHING`,
  // so the fixture must not insert them again: the second insert is a
  // primary-key violation, which is how this was discovered.

  return db;
}

async function seedModel(db, overrides = {}) {
  const model = {
    id: "m1",
    upstreamId: "upstream/m1",
    upstreamSlug: "p1",
    name: "Model One",
    provider: "Family",
    contextWindow: "8k",
    tokenWeight: 1,
    inputPrice: 0,
    outputPrice: 0,
    sellInput: 0,
    sellOutput: 0,
    inCatalog: 1,
    allowFree: 0,
    groupSlug: "paid",
    costSource: "synced",
    costObservedAt: NOW,
    isPrimary: 1,
    status: "active",
    sortOrder: 0,
    ...overrides,
  };

  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, upstream_slug, name, provider, context_window,
         token_weight, input_price_micros, output_price_micros,
         sell_input_micros, sell_output_micros, in_catalog, allow_free,
         group_slug, cost_source, cost_observed_at, is_primary, status,
         sort_order, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      model.id,
      model.upstreamId,
      model.upstreamSlug,
      model.name,
      model.provider,
      model.contextWindow,
      model.tokenWeight,
      model.inputPrice,
      model.outputPrice,
      model.sellInput,
      model.sellOutput,
      model.inCatalog,
      model.allowFree,
      model.groupSlug,
      model.costSource,
      model.costObservedAt,
      model.isPrimary,
      model.status,
      model.sortOrder,
      NOW,
    );

  return model;
}

test("a paid row with no sell price is withheld, and published once priced", async () => {
  const db = await fixture();

  await seedModel(db, { id: "unpriced", sellInput: 0, sellOutput: 0 });
  assert.deepEqual(await listModels(db), [], "an unpriced paid row is not offered");

  await seedModel(db, {
    id: "priced",
    upstreamId: "upstream/priced",
    sellInput: 1_500,
    sellOutput: 3_000,
  });

  clearPublicCatalogCache(db);

  const published = await listModels(db);

  assert.deepEqual(published.map((model) => model.id), ["priced"]);
});

test("a free row publishes without any sell price", async () => {
  const db = await fixture();

  await seedModel(db, {
    id: "free-model",
    groupSlug: "free",
    allowFree: 1,
    costSource: "synced",
  });

  const published = await listModels(db);

  assert.deepEqual(published.map((model) => model.id), ["free-model"]);
  assert.equal(published[0].access, "free");
});

test("a stale manual cost withholds the row; a fresh one admits it", async () => {
  const db = await fixture();

  await seedModel(db, {
    id: "stale",
    costSource: "manual",
    costObservedAt: STALE,
    sellInput: 1_000,
    sellOutput: 1_000,
  });

  assert.deepEqual(
    await listModels(db),
    [],
    "a price nobody has re-checked is not offered, because a crypto sale is not refundable",
  );

  await db
    .prepare("UPDATE models SET cost_observed_at = ? WHERE id = ?")
    .run(NOW, "stale");
  clearPublicCatalogCache(db);

  assert.deepEqual((await listModels(db)).map((model) => model.id), ["stale"]);
});

test("a hidden group is withheld", async () => {
  const db = await fixture();

  await seedModel(db, { id: "hidden", sellInput: 1_000, sellOutput: 1_000 });
  await db
    .prepare("UPDATE model_groups SET hidden = 1 WHERE slug = ?")
    .run("paid");

  assert.deepEqual(await listModels(db), []);
});

test("a subscription row needs an active plan that covers it", async () => {
  const db = await fixture();

  await seedModel(db, {
    id: "gated",
    groupSlug: "subscription",
    costSource: "synced",
  });

  assert.deepEqual(
    await listModels(db),
    [],
    "a tier with no plan to buy must not be published",
  );

  await db
    .prepare(
      `INSERT INTO plans
        (id, slug, name, status, price_micros, currency, interval,
         included_weighted_tokens, overage_mode, overage_markup_bps,
         sort_order, created_at, updated_at)
       VALUES ('plan_1', 'starter', 'Starter', 'active', 1000, 'usd', 'month',
               100000, 'block', 0, 0, ?, ?)`,
    )
    .run(NOW, NOW);
  await db
    .prepare("INSERT INTO plan_groups (plan_id, group_slug) VALUES (?, ?)")
    .run("plan_1", "subscription");
  clearPublicCatalogCache(db);

  assert.deepEqual((await listModels(db)).map((model) => model.id), ["gated"]);
});

test("a non-primary route row is withheld from the published catalog", async () => {
  const db = await fixture();

  await seedModel(db, {
    id: "primary",
    sellInput: 1_000,
    sellOutput: 1_000,
  });
  await seedModel(db, {
    id: "alternative",
    upstreamId: "upstream/alternative",
    sellInput: 500,
    sellOutput: 500,
    isPrimary: 0,
  });

  clearPublicCatalogCache(db);

  assert.deepEqual(
    (await listModels(db)).map((model) => model.id),
    ["primary"],
    "the cheaper alternative answers the same public id; it is not a second listing",
  );
});

test("a disabled provider takes its catalog with it", async () => {
  const db = await fixture();

  await seedModel(db, { id: "orphaned", sellInput: 1_000, sellOutput: 1_000 });
  await db.prepare("UPDATE providers SET enabled = 0 WHERE slug = ?").run("p1");

  assert.deepEqual(await listModels(db), []);
});

test("a delisted or disabled row is withheld", async () => {
  const db = await fixture();

  await seedModel(db, { id: "delisted", sellInput: 1_000, sellOutput: 1_000 });
  await seedModel(db, {
    id: "disabled",
    upstreamId: "upstream/disabled",
    sellInput: 1_000,
    sellOutput: 1_000,
  });

  await db.prepare("UPDATE models SET in_catalog = 0 WHERE id = ?").run("delisted");
  await db.prepare("UPDATE models SET status = 'disabled' WHERE id = ?").run("disabled");
  clearPublicCatalogCache(db);

  assert.deepEqual(await listModels(db), []);
});

test("the cache serves the same read until it is cleared", async () => {
  const db = await fixture();

  await seedModel(db, { id: "first", sellInput: 1_000, sellOutput: 1_000 });

  const first = await listModels(db);
  const again = await listModels(db);

  assert.equal(first, again, "a second read inside the TTL is the same array");

  await seedModel(db, {
    id: "second",
    upstreamId: "upstream/second",
    sellInput: 1_000,
    sellOutput: 1_000,
  });

  assert.equal(
    (await listModels(db)).length,
    1,
    "an insert is not visible until the cache is invalidated",
  );

  clearPublicCatalogCache(db);

  assert.equal((await listModels(db)).length, 2);
});

test("two handles do not share a catalog cache", async () => {
  const first = await fixture();
  const second = await fixture();

  await seedModel(first, { id: "only-here", sellInput: 1_000, sellOutput: 1_000 });

  assert.equal((await listModels(first)).length, 1);
  assert.deepEqual(
    await listModels(second),
    [],
    "a shared cache would let one database answer another database's query",
  );
});
