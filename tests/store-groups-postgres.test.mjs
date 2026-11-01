import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  assignModelGroup,
  createModelGroup,
  deleteModelGroup,
  getModelGroup,
  listModelGroups,
  updateModelGroup,
} from "../lib/storage/store/groups.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-30T12:00:00.000Z";

/**
 * Model groups on the target engine.
 *
 * A group is a billing tier, so these tests concentrate on the edits that move
 * money: a system group must keep its mode, a plan-included group cannot be
 * deleted, and moving rows into a free group must zero their sell prices in the
 * same transaction that moves them.
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
    groupSlug: "paid",
    sellInput: 1_250,
    sellOutput: 2_500,
    ...overrides,
  };

  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, upstream_slug, name, provider, context_window,
         token_weight, input_price_micros, output_price_micros,
         sell_input_micros, sell_output_micros, in_catalog, allow_free,
         group_slug, status, sort_order, synced_at)
       VALUES (?, ?, ?, 'Model', 'Family', '8k', 1, 1000, 2000, ?, ?, 1, 0,
               ?, 'active', 0, ?)`,
    )
    .run(
      model.id,
      model.upstreamId,
      model.upstreamSlug,
      model.sellInput,
      model.sellOutput,
      model.groupSlug,
      NOW,
    );

  return model;
}

test("the three system groups are listed in order", async () => {
  const db = await fixture();

  const groups = await listModelGroups(db);

  assert.deepEqual(
    groups.map((group) => group.slug),
    ["free", "paid", "subscription"],
    "ordered by the seeded sort_order, not alphabetically",
  );
  assert.ok(groups.every((group) => group.isSystem));
});

test("a group cannot duplicate a slug or a label", async () => {
  const db = await fixture();

  const created = await createModelGroup(db, {
    slug: "standard",
    label: "Standard",
    billingMode: "paid",
    description: null,
    sortOrder: 30,
    hidden: false,
    now: NOW,
  });

  assert.equal(created.ok, true);

  const sameSlug = await createModelGroup(db, {
    slug: "standard",
    label: "Other",
    billingMode: "paid",
    description: null,
    sortOrder: 40,
    hidden: false,
  });

  assert.deepEqual(sameSlug, {
    ok: false,
    status: 409,
    error: "A group with that slug already exists.",
  });

  // The PostgreSQL constraint is a unique index on lower(label), so a case-only
  // duplicate has to be refused here rather than surfacing as a driver error.
  const sameLabel = await createModelGroup(db, {
    slug: "standard-two",
    label: "STANDARD",
    billingMode: "paid",
    description: null,
    sortOrder: 40,
    hidden: false,
  });

  assert.equal(sameLabel.ok, false);
  assert.equal(sameLabel.status, 409);
  assert.match(sameLabel.error, /label already exists/);
});

test("a system group keeps its billing mode", async () => {
  const db = await fixture();

  const result = await updateModelGroup(db, "paid", {
    label: "Paid",
    billingMode: "free",
    description: null,
    sortOrder: 10,
    hidden: false,
  });

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: "A system group's billing mode cannot be changed.",
  });

  assert.equal((await getModelGroup(db, "paid")).billingMode, "paid");
});

test("a custom group can change its label and mode", async () => {
  const db = await fixture();

  await createModelGroup(db, {
    slug: "standard",
    label: "Standard",
    billingMode: "paid",
    description: "First description",
    sortOrder: 30,
    hidden: false,
    now: NOW,
  });

  const updated = await updateModelGroup(db, "standard", {
    label: "Standard tier",
    billingMode: "paid",
    description: "Edited",
    sortOrder: 35,
    hidden: true,
  });

  assert.equal(updated.ok, true);
  assert.equal(updated.group.label, "Standard tier");
  assert.equal(updated.group.hidden, true);
  assert.equal(updated.group.modelCount, 0);
});

test("moving a row into a free group zeroes its sell price", async () => {
  const db = await fixture();
  await seedModel(db);

  await createModelGroup(db, {
    slug: "courtesy",
    label: "Courtesy",
    billingMode: "free",
    description: null,
    sortOrder: 40,
    hidden: false,
    now: NOW,
  });

  assert.equal(await assignModelGroup(db, "m1", "courtesy"), "ok");

  const row = await db
    .prepare(
      "SELECT group_slug, group_source, sell_input_micros, sell_output_micros FROM models WHERE id = ?",
    )
    .get("m1");

  assert.equal(row.group_slug, "courtesy");
  assert.equal(
    row.group_source,
    "manual",
    "a manual assignment must survive the next sync",
  );
  assert.equal(Number(row.sell_input_micros), 0);
  assert.equal(Number(row.sell_output_micros), 0);

  const group = await getModelGroup(db, "courtesy");

  assert.equal(group.modelCount, 1);
});

test("assignment refuses an unknown model or group", async () => {
  const db = await fixture();
  await seedModel(db);

  assert.equal(await assignModelGroup(db, "missing", "paid"), "model_not_found");
  assert.equal(await assignModelGroup(db, "m1", "missing"), "group_not_found");
});

test("system groups cannot be deleted", async () => {
  const db = await fixture();

  const result = await deleteModelGroup(db, "free", "paid");

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: "System groups cannot be deleted.",
  });
});

test("a group included by a plan cannot be deleted", async () => {
  const db = await fixture();

  await createModelGroup(db, {
    slug: "bundle",
    label: "Bundle",
    billingMode: "subscription",
    description: null,
    sortOrder: 50,
    hidden: false,
    now: NOW,
  });
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
    .run("plan_1", "bundle");

  const result = await deleteModelGroup(db, "bundle", "paid");

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.match(result.error, /included by a plan/);
});

test("deleting a group reassigns its models to the destination", async () => {
  const db = await fixture();
  await seedModel(db, { groupSlug: "standard" });

  await createModelGroup(db, {
    slug: "standard",
    label: "Standard",
    billingMode: "paid",
    description: null,
    sortOrder: 30,
    hidden: false,
    now: NOW,
  });

  assert.deepEqual(await deleteModelGroup(db, "standard", "paid"), { ok: true });

  const row = await db
    .prepare("SELECT group_slug, group_source FROM models WHERE id = ?")
    .get("m1");

  assert.equal(row.group_slug, "paid");
  assert.equal(row.group_source, "manual");
  assert.equal(await getModelGroup(db, "standard"), undefined);
});
