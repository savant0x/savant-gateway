import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  authenticateApiKey,
  createDevApiKey,
  listApiKeys,
  revokeApiKey,
} from "../lib/storage/store/keys.ts";
import { averageMarginBps } from "../lib/pricing.ts";
import { summarizePricing } from "../lib/storage/store/pricing.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-30T12:00:00.000Z";

/**
 * The first read-path modules on the async handle.
 *
 * The key store is checked end to end because authentication is the one read
 * that also writes: a successful login stamps `last_used_at`, and the ported
 * path must keep the same refusal rules (revoked key, suspended account) that
 * the live path has.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES ('u1', 'u1@example.test', 'Customer', 'active', ?)`,
    )
    .run(NOW);

  return db;
}

test("a created key authenticates and stamps its last use", async () => {
  const db = await fixture();

  const created = await createDevApiKey(db, "Console key", "u1");

  assert.equal(created.key.status, "active");
  assert.equal(created.key.name, "Console key");
  // The prefix is a display string — first eight characters, an ellipsis, last
  // four — not a literal prefix, so it cannot be compared with `startsWith`.
  const [head, tail] = created.key.prefix.split("…");

  assert.ok(created.secret.startsWith("sk-"));
  assert.equal(created.secret.slice(0, 8), head);
  assert.equal(created.secret.slice(-4), tail);

  const auth = await authenticateApiKey(db, created.secret);

  assert.deepEqual(auth, {
    keyId: created.key.id,
    userId: "u1",
    keyPrefix: created.key.prefix,
  });

  const stamped = await db
    .prepare("SELECT last_used_at FROM api_keys WHERE id = ?")
    .get(created.key.id);

  assert.ok(stamped.last_used_at, "a successful authentication stamps the key");
});

test("the secret is never stored in the clear", async () => {
  const db = await fixture();
  const created = await createDevApiKey(db, "Console key", "u1");

  const row = await db
    .prepare("SELECT secret_hash FROM api_keys WHERE id = ?")
    .get(created.key.id);

  assert.notEqual(row.secret_hash, created.secret);
  assert.ok(!row.secret_hash.includes(created.secret));
});

test("an unknown secret authenticates as nobody", async () => {
  const db = await fixture();

  assert.equal(await authenticateApiKey(db, "sk_not_a_real_key"), null);
});

test("a revoked key stops authenticating immediately", async () => {
  const db = await fixture();
  const created = await createDevApiKey(db, "Console key", "u1");

  assert.equal(await revokeApiKey(db, created.key.id, "u1"), true);
  assert.equal(await authenticateApiKey(db, created.secret), null);

  const [key] = await listApiKeys(db, "u1");

  assert.equal(key.status, "revoked");
});

test("revocation is scoped to the owner", async () => {
  const db = await fixture();
  const created = await createDevApiKey(db, "Console key", "u1");

  assert.equal(
    await revokeApiKey(db, created.key.id, "someone_else"),
    false,
    "another account cannot revoke this key",
  );
  assert.ok(await authenticateApiKey(db, created.secret));
});

test("a suspended account cannot authenticate its own active key", async () => {
  const db = await fixture();
  const created = await createDevApiKey(db, "Console key", "u1");

  await db
    .prepare("UPDATE users SET status = 'suspended' WHERE id = ?")
    .run("u1");

  assert.equal(
    await authenticateApiKey(db, created.secret),
    null,
    "key status and account status are both required",
  );
});

test("keys are listed newest first for their owner only", async () => {
  const db = await fixture();
  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES ('u2', 'u2@example.test', 'Other', 'active', ?)`,
    )
    .run(NOW);

  const first = await createDevApiKey(db, "First", "u1");
  const second = await createDevApiKey(db, "Second", "u1");
  await createDevApiKey(db, "Theirs", "u2");

  const keys = await listApiKeys(db, "u1");

  assert.deepEqual(
    keys.map((key) => key.name),
    ["Second", "First"],
    "newest first, and never another account's keys",
  );
  assert.equal(keys.length, 2);
  assert.ok(first.key.id !== second.key.id);
});

function model(overrides) {
  return {
    id: "m",
    upstreamId: "m",
    name: "Model",
    family: "Test",
    contextWindow: "1k",
    tokenWeight: 1,
    allowFree: false,
    access: "paid",
    groupSlug: "paid",
    groupLabel: "Paid",
    groupBillingMode: "paid",
    groupSource: "auto",
    requiresSubscription: false,
    inputPricePer1M: 0,
    outputPricePer1M: 0,
    supportsTools: false,
    supportsVision: false,
    health: null,
    status: "active",
    syncedAt: NOW,
    upstreamSlug: "provider",
    protocol: "chat",
    costSource: "synced",
    costInputPer1M: 1,
    costOutputPer1M: 1,
    ownCostInputPer1M: 1,
    ownCostOutputPer1M: 1,
    priceSource: "auto",
    routeGroup: "m",
    isPrimary: true,
    servedProviderSlug: null,
    routes: [],
    inputMarginBps: 2_500,
    outputMarginBps: 2_500,
    blendedProfitMicros: 100,
    inCatalog: true,
    sortOrder: 0,
    ...overrides,
  };
}

test("the pricing summary separates priced, unpriced and free", () => {
  const summary = summarizePricing(
    [
      model({ id: "priced", inputPricePer1M: 2 }),
      model({ id: "output-only", outputPricePer1M: 3 }),
      model({ id: "unpriced" }),
      model({ id: "free", access: "free", inputPricePer1M: 0 }),
      model({ id: "delisted", inCatalog: false, inputPricePer1M: 5 }),
    ],
    2_500,
  );

  assert.equal(summary.pricedCount, 2);
  assert.equal(summary.unpricedCount, 1);
  assert.equal(summary.freeCount, 1);
  assert.equal(summary.markupBps, 2_500);
  assert.equal(
    summary.averageInputMarginBps,
    2_500,
    "a row priced on output only still carries a margin, and does not skew input",
  );
});

test("an empty priced set matches the live helper exactly", () => {
  const summary = summarizePricing([model({ id: "unpriced" })], 2_500);

  assert.equal(summary.pricedCount, 0);
  assert.equal(summary.unpricedCount, 1);

  // Parity, not a number this test invented. `averageMarginBps([])` returns
  // NaN, so the ported summary reproduces a pre-existing defect in the live
  // path: a catalog with nothing priced renders "NaN%" instead of "—". The
  // port is not the place to change behaviour; recorded in FID-085 instead.
  assert.equal(summary.averageInputMarginBps, averageMarginBps([]));
  assert.equal(summary.averageOutputMarginBps, averageMarginBps([]));
});
