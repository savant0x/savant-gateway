import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { getProviderStatus } from "../lib/storage/store/provider.ts";
import {
  createProvider,
  deleteProvider,
  getProvider,
  getProviderStatusBySlug,
  listProviderRecords,
  listProviders,
  setProviderEnabled,
  updateProvider,
} from "../lib/storage/store/providers.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-30T12:00:00.000Z";

/**
 * The provider registry on the target engine.
 *
 * A provider row decides where a call is sent, so these tests cover the
 * admission-facing behaviour rather than the form: an unknown provider reports
 * `unconfigured` instead of inheriting numbers, disabling stops route
 * reconciliation from publishing through it, and deleting removes its catalog
 * while leaving usage history alone.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();

  return createStorageDatabase({ env: {}, pool });
}

function input(overrides = {}) {
  return {
    slug: "extra",
    label: "Extra Provider",
    kind: "openai",
    baseUrl: "https://extra.example.test/v1",
    keyEnvVar: "EXTRA_KEY",
    defaultHeaders: { "x-source": "gateway" },
    capabilities: { balance: false, subscription: false, pricing: false },
    enabled: true,
    sortOrder: 40,
    ...overrides,
  };
}

test("the seeded registry is listed in sort order", async () => {
  const db = await fixture();

  const records = await listProviderRecords(db);

  assert.deepEqual(
    records.map((provider) => provider.slug),
    ["savant", "commandcode", "apixo"],
    "the migration seeds all three, ordered by sort_order",
  );
  assert.equal(records[0].label, "Savant");
  assert.equal(records[0].defaultHeaders.src, "gate");
});

test("the summary carries a model count and a status per provider", async () => {
  const db = await fixture();

  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, upstream_slug, name, provider, context_window,
         token_weight, in_catalog, group_slug, status, sort_order, synced_at)
       VALUES ('commandcode/m1', 'm1', 'commandcode', 'Model', 'Family', '8k',
               1, 1, 'paid', 'active', 0, ?)`,
    )
    .run(NOW);

  const providers = await listProviders(db);
  const bySlug = Object.fromEntries(providers.map((p) => [p.slug, p]));

  assert.equal(bySlug.commandcode.modelCount, 1);
  assert.equal(bySlug.savant.modelCount, 0);
  assert.equal(typeof bySlug.savant.configured, "boolean");
  assert.ok(
    ["unconfigured", "ok", "error"].includes(bySlug.savant.status),
    `unexpected status ${bySlug.savant.status}`,
  );
});

test("an unknown provider reports unconfigured, not a stale balance", async () => {
  const db = await fixture();

  const status = await getProviderStatusBySlug(db, "missing");

  assert.equal(status.configured, false);
  assert.equal(status.status, "unconfigured");
  assert.equal(status.balanceUsd, null);
  assert.equal(status.admissionRemainingTokens, null);

  // The compatibility view answers for the default provider.
  const legacy = await getProviderStatus(db);

  assert.equal(legacy.status, (await getProviderStatusBySlug(db, "savant")).status);
});

test("enabling and disabling a provider is recorded", async () => {
  const db = await fixture();

  assert.equal(await setProviderEnabled(db, "apixo", true, NOW), true);
  assert.equal((await getProvider(db, "apixo")).enabled, true);

  assert.equal(await setProviderEnabled(db, "apixo", false, NOW), true);
  assert.equal((await getProvider(db, "apixo")).enabled, false);

  assert.equal(
    await setProviderEnabled(db, "missing", true, NOW),
    false,
    "an unknown slug reports no change rather than inventing a row",
  );
});

test("a provider is created, updated and deleted", async () => {
  const db = await fixture();

  const created = await createProvider(db, input(), NOW);

  assert.ok(created);
  assert.equal(created.slug, "extra");
  assert.equal(created.enabled, true);
  assert.deepEqual(created.defaultHeaders, { "x-source": "gateway" });

  const updated = await updateProvider(
    db,
    "extra",
    input({ label: "Renamed", enabled: false }),
    NOW,
  );

  assert.equal(updated.label, "Renamed");
  assert.equal(updated.enabled, false);

  assert.equal(await deleteProvider(db, "extra"), true);
  assert.equal(await getProvider(db, "extra"), undefined);
});

test("deleting a provider removes its catalog but never the default", async () => {
  const db = await fixture();

  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, upstream_slug, name, provider, context_window,
         token_weight, in_catalog, group_slug, status, sort_order, synced_at)
       VALUES ('commandcode/gone', 'gone', 'commandcode', 'Model', 'Family',
               '8k', 1, 1, 'paid', 'active', 0, ?)`,
    )
    .run(NOW);

  assert.equal(await deleteProvider(db, "commandcode"), true);
  assert.equal(await getProvider(db, "commandcode"), undefined);

  const models = await db
    .prepare("SELECT COUNT(*) AS total FROM models WHERE upstream_slug = ?")
    .get("commandcode");

  assert.equal(Number(models.total), 0, "the provider's catalog rows are removed");

  assert.equal(
    await deleteProvider(db, "savant"),
    false,
    "the default provider is not deletable",
  );
  assert.ok(await getProvider(db, "savant"));
});

test("an unknown provider cannot be updated", async () => {
  const db = await fixture();

  assert.equal(await updateProvider(db, "missing", input(), NOW), undefined);
});
