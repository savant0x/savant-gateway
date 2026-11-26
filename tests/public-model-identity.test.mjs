import assert from "node:assert/strict";
import test from "node:test";

import { displayModelId, modelIdLeaf, modelPath } from "../lib/model-identity.ts";
import {
  catalogTableData,
  priceEngineModels,
  testerModels,
} from "../lib/catalog-payload.ts";
import { openAiModelObject } from "../lib/openai-model.ts";
import { resolveModel } from "../lib/storage/gateway/resolution.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import { getPublishedModel } from "../lib/storage/store/catalog.ts";
import { bindStoreRuntime } from "../lib/store-facade/runtime.ts";
import {
  idNamespaceProblem,
  slugHits,
} from "../scripts/http-suite/identity.mjs";

/**
 * A routing key is not a public identity (FID-2026-1125-002).
 *
 * The stored id carries the upstream account slug and the upstream's publisher
 * path, so every surface that printed it named the company this service resells.
 * These cases pin the rules: the display id keeps a billing tier and nothing
 * else, the published id is the display id, the gateway resolves it, a stored key
 * still resolves to itself, and a leaf two rows share answers with neither.
 */

const NOW = "2026-11-25T00:00:00.000Z";

async function seedRow(db, { id, upstreamSlug, upstreamId, sell = 1_000_000 }) {
  await db
    .prepare(
      `INSERT INTO models
         (id, upstream_id, upstream_slug, name, provider, family, protocol,
          context_window, input_price_micros, output_price_micros,
          sell_input_micros, sell_output_micros, price_source, cost_source,
          supports_tools, supports_vision, status, sort_order,
          synced_at, in_catalog)
        VALUES (?, ?, ?, ?, ?, ?, 'chat', '128000', 500000, 1000000, ?, ?,
               'manual', 'manual', 0, 0, 'active', 0, ?, 1)`,
    )
    .run(
      id,
      upstreamId,
      upstreamSlug,
      `${upstreamId} name`,
      "Family",
      "Family",
      sell,
      sell * 2,
      NOW,
    );
}

async function seedProvider(db, slug) {
  await db
    .prepare(
      `INSERT INTO providers
         (slug, label, kind, base_url, key_env_var, default_headers,
          supports_balance, supports_subscription, supports_pricing,
          enabled, sort_order, status, created_at, updated_at)
       VALUES (?, ?, 'openai', 'https://upstream.test/v1', 'TEST_PROVIDER_KEY',
               '{}', 0, 0, 0, 1, 0, 'active', ?, ?)`,
    )
    .run(slug, `${slug} label`, NOW, NOW);
}

test("a display id keeps the model's own name and its billing tier", () => {
  assert.equal(displayModelId("inferhub/alicn/gpt-6-luna", "inferhub"), "gpt-6-luna");
  assert.equal(displayModelId("inferhub/free/gpt-6-luna", "inferhub"), "free/gpt-6-luna");
  assert.equal(displayModelId("cx/gpt-6-luna", "savant"), "gpt-6-luna");
  assert.equal(displayModelId("free/gpt-6-luna", "savant"), "free/gpt-6-luna");

  assert.equal(modelIdLeaf("inferhub/alicn/gpt-6-luna"), "gpt-6-luna");
  assert.equal(modelIdLeaf("free/inferhub/alicn/gpt-6-luna"), "free/gpt-6-luna");

  assert.equal(modelPath("inferhub/free/gpt-6-luna", "inferhub"), "/models/free/gpt-6-luna");
  assert.equal(modelPath("inferhub/alicn/gpt 6", "inferhub"), "/models/gpt%206");
});

test("a published id may carry a billing tier and no other namespace", () => {
  assert.equal(idNamespaceProblem("gpt-6-luna"), null);
  assert.equal(idNamespaceProblem("free/gpt-6-luna"), null);
  assert.equal(idNamespaceProblem("subscription/gpt-6-luna"), null);

  assert.notEqual(idNamespaceProblem("inferhub/gpt-6-luna"), null);
  assert.notEqual(idNamespaceProblem("inferhub/alicn/gpt-6-luna"), null);
  assert.notEqual(idNamespaceProblem("free/inferhub/gpt-6-luna"), null);
  assert.notEqual(idNamespaceProblem(""), null);
});

test("a provider slug is found in text but not inside a longer word or id", () => {
  assert.deepEqual(slugHits("supplied by inferhub limited", ["inferhub"]), [
    "inferhub",
  ]);
  assert.deepEqual(slugHits("the allocation panel", ["alloc"]), []);
  assert.deepEqual(slugHits("model mock-paid", ["mock"]), []);
  assert.deepEqual(slugHits("model free/mock-free", ["mock"]), []);
  assert.deepEqual(slugHits("model http-suite-mock", ["mock"]), []);
});

test("a namespaced row publishes, retrieves and resolves by its display id", async () => {
  const db = await createStorageDatabase({ env: {} });

  bindStoreRuntime(async () => db);

  try {
    await seedProvider(db, "testseller");
    await seedRow(db, {
      id: "testseller/alicn/gpt-6-luna",
      upstreamSlug: "testseller",
      upstreamId: "alicn/gpt-6-luna",
    });

    const published = await getPublishedModel(db, "gpt-6-luna");

    assert.equal(published?.id, "testseller/alicn/gpt-6-luna");

    const object = await openAiModelObject(published);

    assert.equal(object.id, "gpt-6-luna");
    assert.equal(object.owned_by, "savant-gateway");

    const byStoredId = await getPublishedModel(db, "testseller/alicn/gpt-6-luna");

    assert.equal(byStoredId?.id, "testseller/alicn/gpt-6-luna");

    const resolved = await resolveModel(db, "gpt-6-luna");

    assert.equal(resolved?.id, "testseller/alicn/gpt-6-luna");
    assert.equal(
      (await resolveModel(db, "testseller/alicn/gpt-6-luna"))?.id,
      "testseller/alicn/gpt-6-luna",
    );
    assert.equal(await getPublishedModel(db, "luna"), null);
  } finally {
    await db.close();
  }
});

test("a stored key resolves to itself before another row's leaf", async () => {
  const db = await createStorageDatabase({ env: {} });

  bindStoreRuntime(async () => db);

  try {
    await seedProvider(db, "testseller");
    await seedRow(db, {
      id: "testseller/alicn/gpt-6-luna",
      upstreamSlug: "testseller",
      upstreamId: "alicn/gpt-6-luna",
    });
    await seedRow(db, {
      id: "gpt-6-luna",
      upstreamSlug: "testseller",
      upstreamId: "unscoped-gpt-6-luna",
    });

    // The display id of the first row now equals the stored key of the second.
    // Both reads answer for the stored key, which is the row an existing client
    // already asks for; the leaf never shadows it.
    assert.equal((await getPublishedModel(db, "gpt-6-luna"))?.id, "gpt-6-luna");
    assert.equal((await resolveModel(db, "gpt-6-luna"))?.id, "gpt-6-luna");
    assert.equal(
      (await resolveModel(db, "testseller/alicn/gpt-6-luna"))?.id,
      "testseller/alicn/gpt-6-luna",
    );
  } finally {
    await db.close();
  }
});

test("a leaf two rows share is refused rather than guessed", async () => {
  const db = await createStorageDatabase({ env: {} });

  bindStoreRuntime(async () => db);

  try {
    await seedProvider(db, "testseller");
    await seedProvider(db, "testreseller");
    await seedRow(db, {
      id: "testseller/alicn/bravo-1",
      upstreamSlug: "testseller",
      upstreamId: "alicn/bravo-1",
    });
    await seedRow(db, {
      id: "testreseller/cc/bravo-1",
      upstreamSlug: "testreseller",
      upstreamId: "cc/bravo-1",
    });

    assert.equal(await getPublishedModel(db, "bravo-1"), null);
    assert.equal(await resolveModel(db, "bravo-1"), undefined);
    assert.equal(
      (await resolveModel(db, "testreseller/cc/bravo-1"))?.id,
      "testreseller/cc/bravo-1",
    );
  } finally {
    await db.close();
  }
});

test("a client payload carries the display id and no upstream fields", () => {
  const row = {
    id: "testseller/alicn/gpt-6-luna",
    upstreamId: "alicn/gpt-6-luna",
    upstreamSlug: "testseller",
    name: "GPT 6 Luna",
    family: "GPT",
    access: "paid",
    inputPricePer1M: 1,
    outputPricePer1M: 2,
    contextWindow: "1M",
    tokenWeight: 1,
    allowFree: false,
    groupSlug: "paid",
    groupLabel: "Paid",
    groupBillingMode: "paid",
    groupSource: "auto",
    requiresSubscription: false,
    supportsTools: true,
    supportsVision: false,
    health: null,
    status: "active",
    syncedAt: NOW,
  };
  const twin = { ...row, id: "testseller/cc/gpt-6-luna" };
  const payloads = [
    priceEngineModels([row]),
    testerModels([row]),
    catalogTableData([row, twin], { [row.id]: { rank: 1 } }, { [row.id]: { bps: 0 } }),
  ];

  for (const payload of payloads) {
    const text = JSON.stringify(payload);

    assert.equal(text.includes("testseller"), false, "upstream slug in a payload");
    assert.equal(text.includes("alicn/"), false, "upstream id in a payload");
    assert.equal(text.includes("/gpt-6-luna\",\"upstreamSlug"), false);
  }

  // The table's maps are keyed by the id the table now holds, so a lookup by the
  // published id still finds the benchmark and the comparison.
  const table = catalogTableData([row, twin], { [row.id]: { rank: 1 } }, { [row.id]: { bps: 0 } });

  assert.equal(table.models.length, 1);
  assert.equal(table.models[0].id, "gpt-6-luna");
  assert.equal(table.models[0].upstreamSlug, "");
  assert.deepEqual(table.benchmarks["gpt-6-luna"], { rank: 1 });
  assert.deepEqual(table.comparisons["gpt-6-luna"], { bps: 0 });
});
