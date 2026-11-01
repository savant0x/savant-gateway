import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  createPlan,
  deletePlan,
  getPlanById,
  getPlanBySlug,
  listPlans,
  planHasSubscriptions,
} from "../lib/storage/store/plans.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-30T12:00:00.000Z";

/**
 * Plans on the target engine.
 *
 * A plan is a purchasable product, so these tests cover the boundaries rather
 * than the happy path alone: a free group cannot be sold, an active plan must
 * actually cover something, and a plan with subscribers is archived, not
 * deleted. Draft status is used wherever the sales policy might otherwise
 * decide the outcome, so the assertions belong to this module.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, upstream_slug, name, provider, context_window,
         token_weight, input_price_micros, output_price_micros, in_catalog,
         group_slug, status, sort_order, synced_at)
       VALUES ('sub-model', 'sub-model', 'savant', 'Subscription Model',
               'Family', '8k', 1, 1000, 2000, 1, 'subscription', 'active', 0, ?)`,
    )
    .run(NOW);

  return db;
}

function planInput(overrides = {}) {
  return {
    slug: "starter",
    name: "Starter",
    description: null,
    status: "draft",
    // Dollars, and a whole number of cents: `readPlanValues` refuses a price
    // with sub-cent precision, because Stripe would round it at checkout and the
    // customer would be charged something other than the published price.
    priceUsd: 9.99,
    currency: "usd",
    interval: "month",
    includedWeightedTokens: 100_000,
    overageMode: "block",
    overageMarkupBps: 0,
    sortOrder: 0,
    groups: ["subscription"],
    modelIds: [],
    ...overrides,
  };
}

test("a plan expands its included group into entitled models", async () => {
  const db = await fixture();

  const created = await createPlan(db, planInput(), NOW);

  assert.equal(created.ok, true);
  assert.equal(created.plan.slug, "starter");
  assert.equal(created.plan.status, "draft");
  assert.equal(created.plan.priceMicros, 9_990_000);
  assert.equal(created.plan.includedWeightedTokens, 100_000);
  assert.deepEqual(
    created.plan.groups.map((group) => group.slug),
    ["subscription"],
  );
  assert.deepEqual(
    created.plan.modelIds,
    ["sub-model"],
    "the group inclusion is expanded to the exact model ids the snapshot will hold",
  );
  assert.equal(created.plan.modelCount, 1);
  assert.equal(created.plan.costBearingModelCount, 1);
  assert.equal(created.plan.subscriberCount, 0);
});

test("the slug and the name are both unique", async () => {
  const db = await fixture();

  assert.equal((await createPlan(db, planInput(), NOW)).ok, true);

  const sameSlug = await createPlan(
    db,
    planInput({ slug: "starter", name: "Other" }),
    NOW,
  );

  assert.deepEqual(sameSlug, {
    ok: false,
    status: 409,
    error: "That plan slug is already in use.",
  });

  const sameName = await createPlan(
    db,
    planInput({ slug: "starter-two", name: "Starter" }),
    NOW,
  );

  assert.equal(sameName.ok, false);
  assert.equal(sameName.status, 409);
  assert.match(sameName.error, /name is already in use/);
});

test("a free group cannot be sold inside a paid plan", async () => {
  const db = await fixture();

  const result = await createPlan(db, planInput({ groups: ["free"] }), NOW);

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: "Free groups cannot be included in a paid plan.",
  });
});

test("an unknown group or model is refused", async () => {
  const db = await fixture();

  const unknownGroup = await createPlan(
    db,
    planInput({ groups: ["nope"] }),
    NOW,
  );

  assert.equal(unknownGroup.status, 400);
  assert.match(unknownGroup.error, /groups do not exist/);

  const unknownModel = await createPlan(
    db,
    planInput({ groups: [], modelIds: ["nope"] }),
    NOW,
  );

  assert.equal(unknownModel.status, 400);
  assert.match(unknownModel.error, /models do not exist/);
});

test("an active plan must cover at least one model", async () => {
  const db = await fixture();

  const result = await createPlan(
    db,
    planInput({ status: "active", groups: [], modelIds: [] }),
    NOW,
  );

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: "An active plan needs at least one included model.",
  });
});

test("plans are looked up by id and by slug", async () => {
  const db = await fixture();

  const created = await createPlan(db, planInput(), NOW);

  assert.ok(created.ok);

  const byId = await getPlanById(db, created.plan.id);

  assert.equal(byId.slug, "starter");

  const bySlug = await getPlanBySlug(db, "starter");

  assert.equal(bySlug.id, created.plan.id);

  assert.equal(await getPlanById(db, "plan_missing"), null);
  assert.equal(await getPlanBySlug(db, "missing"), null);
});

test("plans are listed by sort order then name", async () => {
  const db = await fixture();

  await createPlan(db, planInput({ slug: "second", name: "Second", sortOrder: 20 }), NOW);
  await createPlan(db, planInput({ slug: "first", name: "First", sortOrder: 10 }), NOW);

  const plans = await listPlans(db);
  const mine = plans.filter((plan) => plan.slug === "first" || plan.slug === "second");

  assert.deepEqual(
    mine.map((plan) => plan.slug),
    ["first", "second"],
  );
});

test("a draft plan can be deleted, and an unknown one cannot", async () => {
  const db = await fixture();

  const created = await createPlan(db, planInput(), NOW);

  assert.ok(created.ok);
  assert.equal(await planHasSubscriptions(db, created.plan.id), false);
  assert.deepEqual(await deletePlan(db, created.plan.id), { ok: true });
  assert.equal(await getPlanById(db, created.plan.id), null);

  assert.deepEqual(await deletePlan(db, created.plan.id), {
    ok: false,
    status: 404,
    error: "Plan not found.",
  });
});
