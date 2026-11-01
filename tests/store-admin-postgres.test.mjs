import assert from "node:assert/strict";
import test from "node:test";

import { defaultSellMicros } from "../lib/pricing.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import { listModels } from "../lib/storage/store/catalog.ts";
import { replaceModels } from "../lib/storage/store/model-sync.ts";
import {
  applyCatalogMarkup,
  getModelByUpstreamId,
  getModelForGateway,
  listAllModels,
  setModelPricing,
  setModelStatus,
} from "../lib/storage/store/models.ts";
import { reconcileRoutes } from "../lib/storage/store/routes.ts";
import { saveMarkupBps } from "../lib/storage/store/settings.ts";
import { listAdminUsage, listUsage } from "../lib/storage/store/usage.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-30T12:00:00.000Z";
const EARLIER = "2026-10-30T11:00:00.000Z";

/**
 * The admin catalog on the target engine.
 *
 * The two rules worth the most here are route reconciliation (a cheaper provider
 * must take over serving without changing the published id) and catalog
 * preservation (a sync must not destroy an operator's manual price or resurrect
 * a delisted row).
 *
 * The fixture mirrors the real id shape, and the first run proved why it has to:
 * the incumbent provider publishes the **plain** upstream id (`m1`), while an
 * additional provider publishes a namespaced one (`commandcode/m1`). Making both
 * rows namespaced left the router with no stable candidate and it published the
 * winner's id, which is correct behaviour for that input and the wrong input to
 * assert against.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();

  return createStorageDatabase({ env: {}, pool });
}

async function seedModel(db, overrides = {}) {
  const model = {
    id: "m1",
    upstreamId: "m1",
    upstreamSlug: "savant",
    name: "Model One",
    provider: "Family",
    contextWindow: "8k",
    tokenWeight: 1,
    inputPrice: 1_000,
    outputPrice: 2_000,
    sellInput: 1_250,
    sellOutput: 2_500,
    priceSource: "auto",
    inCatalog: 1,
    allowFree: 0,
    groupSlug: "paid",
    costSource: "synced",
    routeGroup: "shared/m1",
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
         sell_input_micros, sell_output_micros, price_source, in_catalog,
         allow_free, group_slug, cost_source, route_group, is_primary, status,
         sort_order, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      model.priceSource,
      model.inCatalog,
      model.allowFree,
      model.groupSlug,
      model.costSource,
      model.routeGroup,
      model.isPrimary,
      model.status,
      model.sortOrder,
      NOW,
    );

  return model;
}

function synced(overrides = {}) {
  return {
    id: "m1",
    upstreamId: "m1",
    upstreamSlug: "savant",
    name: "Model One",
    family: "Family",
    protocol: "chat",
    routeGroup: "shared/m1",
    contextWindow: "8k",
    tokenWeight: 1,
    costInputMicros: 1_000,
    costOutputMicros: 2_000,
    costSource: "synced",
    allowFree: false,
    supportsTools: false,
    supportsVision: false,
    health: null,
    sortOrder: 0,
    ...overrides,
  };
}

test("the cheapest servable provider takes over serving", async () => {
  const db = await fixture();

  await seedModel(db);
  await seedModel(db, {
    id: "commandcode/m1",
    upstreamSlug: "commandcode",
    inputPrice: 500,
    outputPrice: 1_000,
    sellInput: 625,
    sellOutput: 1_250,
  });

  await reconcileRoutes(db);

  const rows = await db
    .prepare(
      "SELECT id, is_primary, served_provider_slug FROM models ORDER BY id",
    )
    .all();
  const primaries = rows.filter((row) => Number(row.is_primary) === 1);

  assert.equal(primaries.length, 1, "exactly one row is published per group");
  assert.equal(
    primaries[0].id,
    "m1",
    "the published id stays stable when the serving provider changes",
  );
  assert.equal(
    primaries[0].served_provider_slug,
    "commandcode",
    "the cheaper provider answers the published id",
  );

  const other = rows.find((row) => row.id !== primaries[0].id);

  assert.equal(
    other.served_provider_slug,
    null,
    "a non-published row resolves to its own provider, not the winner's",
  );
});

test("the admin catalog carries every provider route for a group", async () => {
  const db = await fixture();

  await seedModel(db);
  await seedModel(db, {
    id: "commandcode/m1",
    upstreamSlug: "commandcode",
    inputPrice: 500,
    outputPrice: 1_000,
  });
  await reconcileRoutes(db);

  const models = await listAllModels(db);
  const published = models.find((model) => model.id === "m1");

  assert.ok(published);
  assert.equal(published.routes.length, 2);
  assert.deepEqual(
    published.routes.map((route) => route.providerSlug).sort(),
    ["commandcode", "savant"],
    "the operator sees the alternatives, not only the winner",
  );
  assert.equal(published.servedProviderSlug, "commandcode");
});

test("activating a row with no known cost is refused", async () => {
  const db = await fixture();
  await seedModel(db, {
    id: "unknown-cost",
    costSource: "unknown",
    status: "disabled",
  });

  assert.equal(await setModelStatus(db, "unknown-cost", "active"), "cost_unknown");
  assert.equal(await setModelStatus(db, "missing", "active"), "not_found");

  await db
    .prepare("UPDATE models SET cost_source = 'synced' WHERE id = ?")
    .run("unknown-cost");

  assert.equal(await setModelStatus(db, "unknown-cost", "active"), "ok");
});

test("a free row cannot be given a sell price", async () => {
  const db = await fixture();
  await seedModel(db, { id: "free-row", groupSlug: "free", allowFree: 1 });

  assert.equal(await setModelPricing(db, "free-row", 1_000, 1_000), false);

  const row = await db
    .prepare("SELECT sell_input_micros FROM models WHERE id = ?")
    .get("free-row");

  assert.equal(Number(row.sell_input_micros), 1_250, "unchanged");
});

test("applying a markup reprices auto rows and zeroes free rows", async () => {
  const db = await fixture();

  await seedModel(db, { id: "auto-row" });
  await seedModel(db, {
    id: "free-row",
    // A distinct upstream id: `models_upstream_idx` is unique on
    // (upstream_slug, upstream_id), so two rows cannot share both.
    upstreamId: "free-m1",
    groupSlug: "free",
    allowFree: 1,
    sellInput: 900,
    sellOutput: 900,
  });

  // The order is load-bearing and matches the admin route: the markup is
  // persisted first, because `applyCatalogMarkup` reconciles at the end and
  // `reconcileRoutes` re-derives auto sell prices from the *stored* markup. An
  // apply without a save is silently undone by its own reconcile step.
  await saveMarkupBps(db, 5_000);

  const changed = await applyCatalogMarkup(db, 5_000, true);

  assert.equal(changed, 2);

  const rows = await db
    .prepare("SELECT id, sell_input_micros FROM models ORDER BY id")
    .all();
  const byId = Object.fromEntries(
    rows.map((row) => [row.id, Number(row.sell_input_micros)]),
  );

  assert.equal(byId["auto-row"], defaultSellMicros(1_000, 5_000));
  assert.equal(byId["free-row"], 0);
});

test("a sync preserves a manual sell price", async () => {
  const db = await fixture();
  await seedModel(db, {
    id: "manual-row",
    priceSource: "manual",
    sellInput: 7_777,
    sellOutput: 8_888,
  });

  await replaceModels(db, [synced({ id: "manual-row" })], 2_500, "savant");

  const row = await db
    .prepare(
      "SELECT sell_input_micros, sell_output_micros, price_source FROM models WHERE id = ?",
    )
    .get("manual-row");

  assert.equal(Number(row.sell_input_micros), 7_777, "the operator's price wins");
  assert.equal(Number(row.sell_output_micros), 8_888);
  assert.equal(row.price_source, "manual");
});

test("a row that vanished upstream is delisted, not deleted", async () => {
  const db = await fixture();
  await seedModel(db, { id: "gone", upstreamId: "gone" });

  await replaceModels(db, [], 2_500, "savant");

  const row = await db
    .prepare("SELECT in_catalog FROM models WHERE id = ?")
    .get("gone");

  assert.ok(row, "the row survives");
  assert.equal(Number(row.in_catalog), 0, "but it is no longer published");
});

test("a sync only delists its own provider", async () => {
  const db = await fixture();

  await seedModel(db, { id: "savant/a" });
  await seedModel(db, {
    id: "commandcode/b",
    upstreamSlug: "commandcode",
    routeGroup: "shared/b",
  });

  await replaceModels(db, [], 2_500, "savant");

  const other = await db
    .prepare("SELECT in_catalog FROM models WHERE id = ?")
    .get("commandcode/b");

  assert.equal(
    Number(other.in_catalog),
    1,
    "another provider's catalog is untouched",
  );
});

test("an ambiguous upstream id is not resolved", async () => {
  const db = await fixture();

  await seedModel(db, { id: "m1", upstreamId: "m1" });
  await seedModel(db, {
    id: "commandcode/m1",
    upstreamId: "m1",
    upstreamSlug: "commandcode",
  });

  assert.equal(
    await getModelByUpstreamId(db, "m1"),
    undefined,
    "two providers publish it, so the namespaced id is required",
  );

  const pinned = await getModelForGateway(db, "commandcode/m1");

  assert.ok(pinned);
  assert.equal(pinned.upstreamSlug, "commandcode");
});

test("usage reads are newest first and carry numbers", async () => {
  const db = await fixture();
  await seedModel(db);

  for (const [id, createdAt] of [
    ["u_old", EARLIER],
    ["u_new", NOW],
  ]) {
    await db
      .prepare(
        `INSERT INTO usage_events
           (id, model_id, input_tokens, output_tokens, weighted_tokens,
            cost_micros, charged_micros, status, latency_ms, created_at)
         VALUES (?, 'm1', 100, 50, 0, 250, 400, 'ok', 120, ?)`,
      )
      .run(id, createdAt);
  }

  const usage = await listUsage(db, 10);

  assert.deepEqual(usage.map((row) => row.id), ["u_new", "u_old"]);
  assert.equal(usage[0].chargedMicros, 400);
  assert.equal(typeof usage[0].chargedMicros, "number");
  assert.equal(usage[0].modelName, "Model One");

  const admin = await listAdminUsage(db, 10);

  assert.equal(admin[0].costMicros, 250);
  assert.equal(typeof admin[0].costMicros, "number");
});

test("a sync invalidates the published catalog cache", async () => {
  const db = await fixture();
  await seedModel(db);

  assert.equal((await listModels(db)).length, 1);

  await replaceModels(db, [], 2_500, "savant");

  // `replaceModels` reconciles, which invalidates the published projection. A
  // cached catalog here would keep offering a model that is no longer listed.
  assert.deepEqual(await listModels(db), []);
});
