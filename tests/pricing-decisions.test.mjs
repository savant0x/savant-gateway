import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { setModelPricing } from "../lib/storage/store/models.ts";
import { setModelPricingChecked } from "../lib/storage/store/pricing-approval.ts";
import {
  listPricingDecisions,
  recordPricingDecision,
} from "../lib/storage/store/pricing-decisions.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-11-03T12:00:00.000Z";

async function fixture() {
  const { pool } = await createPgliteDatabase();

  return createStorageDatabase({ env: {}, pool });
}

async function seed(db, overrides = {}) {
  const model = {
    id: "m1",
    upstreamId: "m1",
    upstreamSlug: "savant",
    name: "Model One",
    groupSlug: "paid",
    allowFree: 0,
    costSource: "synced",
    costInput: 1_000,
    costOutput: 2_000,
    sellInput: 1_250,
    sellOutput: 2_500,
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
       VALUES (?, ?, ?, ?, 'Family', '8k', 1, ?, ?, ?, ?, 'manual', 1, ?,
               ?, ?, 'm1', 1, 'active', 0, ?)`,
    )
    .run(
      model.id,
      model.upstreamId,
      model.upstreamSlug,
      model.name,
      model.costInput,
      model.costOutput,
      model.sellInput,
      model.sellOutput,
      model.allowFree,
      model.groupSlug,
      model.costSource,
      NOW,
    );

  return model;
}

test("an approval writes the price and its audit row together", async () => {
  const db = await fixture();

  try {
    await seed(db);

    const updated = await setModelPricing(db, "m1", 2_857_143, 11_428_572, {
      actor: "admin-session",
      reason: "Target 30% margin",
      modelName: "Model One",
      costSource: "synced",
      costInputMicros: 1_000,
      costOutputMicros: 2_000,
      targetMarginBps: 3_000,
      rounding: "micro",
      recommendationJson: JSON.stringify({ eligible: true }),
    });

    assert.equal(updated, true);

    const row = await db
      .prepare(
        "SELECT sell_input_micros, sell_output_micros, price_source FROM models WHERE id = ?",
      )
      .get("m1");

    assert.equal(Number(row.sell_input_micros), 2_857_143);
    assert.equal(Number(row.sell_output_micros), 11_428_572);
    assert.equal(row.price_source, "manual");

    const [decision] = await listPricingDecisions(db, 10);

    assert.equal(decision.modelId, "m1");
    assert.equal(decision.modelName, "Model One");
    assert.equal(decision.actor, "admin-session");
    assert.equal(decision.reason, "Target 30% margin");
    assert.equal(decision.costSource, "synced");
    assert.equal(decision.costInputMicros, 1_000);
    assert.equal(decision.beforeInputMicros, 1_250);
    assert.equal(decision.beforeOutputMicros, 2_500);
    assert.equal(decision.afterInputMicros, 2_857_143);
    assert.equal(decision.afterOutputMicros, 11_428_572);
    assert.equal(decision.targetMarginBps, 3_000);
    assert.equal(decision.rounding, "micro");
    assert.deepEqual(decision.recommendation, { eligible: true });
  } finally {
    await db.close();
  }
});

test("a plain price edit can be audited, and a free row cannot", async () => {
  const db = await fixture();

  try {
    await seed(db);
    await setModelPricing(db, "m1", 1_500, 3_000, {
      actor: "admin-session",
      reason: "Manual price edit.",
      modelName: "Model One",
      costSource: "synced",
      costInputMicros: 1_000,
      costOutputMicros: 2_000,
      targetMarginBps: null,
      rounding: null,
      recommendationJson: JSON.stringify({ mode: "manual" }),
    });
    await setModelPricing(db, "m1", 1_600, 3_100);

    const decisions = await listPricingDecisions(db, 10);

    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].targetMarginBps, null);

    await seed(db, {
      id: "free-row",
      upstreamId: "free-m1",
      groupSlug: "free",
      allowFree: 1,
    });

    const free = await setModelPricing(db, "free-row", 9_000, 9_000, {
      actor: "admin-session",
      reason: "Should not write",
      modelName: "Free",
      costSource: "synced",
      costInputMicros: 0,
      costOutputMicros: 0,
      targetMarginBps: 3_000,
      rounding: "micro",
      recommendationJson: "{}",
    });

    assert.equal(free, false);
    assert.equal((await listPricingDecisions(db, 10)).length, 1);
  } finally {
    await db.close();
  }
});

test("a stale price version is refused without a second decision", async () => {
  const db = await fixture();

  try {
    await seed(db);

    const expected = {
      sellInputMicros: 1_250,
      sellOutputMicros: 2_500,
      costInputMicros: 1_000,
      costOutputMicros: 2_000,
    };
    const approval = {
      actor: "admin-session",
      reason: "Version checked approval",
      modelName: "Model One",
      costSource: "synced",
      costInputMicros: 1_000,
      costOutputMicros: 2_000,
      targetMarginBps: 3_000,
      rounding: "micro",
      recommendationJson: JSON.stringify({ eligible: true }),
    };

    assert.equal(
      (
        await setModelPricingChecked(
          db,
          "m1",
          2_000,
          4_000,
          expected,
          approval,
        )
      ).status,
      "ok",
    );

    assert.equal(
      (
        await setModelPricingChecked(
          db,
          "m1",
          3_000,
          5_000,
          expected,
          approval,
        )
      ).status,
      "stale",
    );

    assert.equal((await listPricingDecisions(db, 10)).length, 1);

    const row = await db
      .prepare("SELECT sell_input_micros FROM models WHERE id = 'm1'")
      .get();

    assert.equal(Number(row.sell_input_micros), 2_000);
  } finally {
    await db.close();
  }
});

test("decision reads are bounded and can be scoped to one model", async () => {
  const db = await fixture();

  try {
    await seed(db);
    await seed(db, { id: "m2", upstreamId: "m2", name: "Model Two" });

    for (const [index, modelId] of ["m1", "m1", "m2"].entries()) {
      await recordPricingDecision(
        db,
        {
          modelId,
          modelName: modelId,
          actor: "admin-session",
          reason: `Decision ${index}`,
          costSource: "synced",
          costInputMicros: 1_000,
          costOutputMicros: 2_000,
          beforeInputMicros: 1_000,
          beforeOutputMicros: 2_000,
          afterInputMicros: 1_500,
          afterOutputMicros: 3_000,
          targetMarginBps: null,
          rounding: null,
          recommendationJson: "{}",
        },
        `2026-11-03T12:00:0${index}.000Z`,
      );
    }

    assert.equal((await listPricingDecisions(db, 2)).length, 2);
    assert.equal((await listPricingDecisions(db, 10, "m1")).length, 2);
    assert.equal((await listPricingDecisions(db, 10, "missing")).length, 0);
  } finally {
    await db.close();
  }
});
