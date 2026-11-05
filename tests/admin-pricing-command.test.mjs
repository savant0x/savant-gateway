import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { setModelPricingChecked } from "../lib/storage/store/pricing-approval.ts";
import { getPricingCommand } from "../lib/storage/store/pricing-command.ts";
import { listPricingDecisions } from "../lib/storage/store/pricing-decisions.ts";
import {
  normalizePricingWindow,
  paginatePricingRows,
  pricingVersionMatches,
  projectPricingVolume,
  readPricingVersion,
  sortPricingRows,
} from "../lib/pricing-command.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-11-03T12:00:00.000Z";
const STAMP = "2026-10-01T00:00:00.000Z";
const IN_WINDOW = "2026-11-02T10:00:00.000Z";
const OUTSIDE = "2026-09-01T10:00:00.000Z";

async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES ('u1', 'u1@example.test', 'One', 'active', ?)`,
    )
    .run(STAMP);

  for (const model of [
    {
      id: "m1",
      name: "Model One",
      costSource: "synced",
      costInput: 500_000,
      costOutput: 1_000_000,
      sellInput: 1_000_000,
      sellOutput: 2_000_000,
      group: "paid",
      allowFree: 0,
    },
    {
      id: "m2",
      name: "Model Two",
      costSource: "unknown",
      costInput: 300_000,
      costOutput: 300_000,
      sellInput: 900_000,
      sellOutput: 900_000,
      group: "paid",
      allowFree: 0,
    },
    {
      id: "free-row",
      name: "Free Model",
      costSource: "synced",
      costInput: 0,
      costOutput: 0,
      sellInput: 0,
      sellOutput: 0,
      group: "free",
      allowFree: 1,
    },
  ]) {
    await db
      .prepare(
        `INSERT INTO models
          (id, upstream_id, upstream_slug, name, provider, context_window,
           token_weight, input_price_micros, output_price_micros,
           sell_input_micros, sell_output_micros, price_source, in_catalog,
           allow_free, group_slug, cost_source, route_group, is_primary, status,
           sort_order, synced_at)
         VALUES (?, ?, ?, ?, 'Family', '8k', 1, ?, ?, ?, ?, 'manual', 1, ?,
                 ?, ?, ?, 1, 'active', 0, ?)`,
      )
      .run(
        model.id,
        model.id,
        "savant",
        model.name,
        model.costInput,
        model.costOutput,
        model.sellInput,
        model.sellOutput,
        model.allowFree,
        model.group,
        model.costSource,
        model.id,
        STAMP,
      );
  }

  const usage = [
    ["u1", "m1", "credit", 1_000_000, 0, 1_000_000, 500_000, IN_WINDOW],
    ["u2", "m1", "credit", 0, 1_000_000, 2_000_000, 1_000_000, IN_WINDOW],
    ["u3", "m1", "free", 10, 10, 0, 999, IN_WINDOW],
    ["u4", "m1", "subscription", 10, 10, 0, 777, IN_WINDOW],
    ["u5", "m2", "credit", 300_000, 0, 300_000, 120_000, IN_WINDOW],
    ["u6", "ghost", "credit", 100_000, 0, 50_000, 20_000, IN_WINDOW],
    ["u7", "m1", "credit", 1, 1, 9_999_999, 9_999_999, OUTSIDE],
  ];

  for (const [id, model, source, input, output, charged, cost, at] of usage) {
    await db
      .prepare(
        `INSERT INTO usage_events
          (id, user_id, model_id, provider_slug, input_tokens, output_tokens,
           charged_micros, cost_micros, billing_source, status, latency_ms,
           created_at)
         VALUES (?, 'u1', ?, 'savant', ?, ?, ?, ?, ?, 'ok', 10, ?)`,
      )
      .run(id, model, input, output, charged, cost, source, at);
  }

  return db;
}

const approval = {
  actor: "admin-session",
  reason: "Quarterly margin review",
  modelName: "Model One",
  costSource: "synced",
  costInputMicros: 500_000,
  costOutputMicros: 1_000_000,
  targetMarginBps: 3_000,
  rounding: "micro",
  recommendationJson: JSON.stringify({ eligible: true }),
};

test("the command center counts settled credit revenue only", async () => {
  const db = await fixture();

  try {
    const data = await getPricingCommand(db, 30, NOW);

    assert.equal(data.rangeDays, 30);
    assert.equal(data.summary.requests, 4);
    assert.equal(data.summary.revenueMicros, 3_350_000);
    assert.equal(data.summary.knownRevenueMicros, 3_000_000);
    assert.equal(data.summary.costMicros, 1_500_000);
    assert.equal(data.summary.contributionMicros, 1_500_000);
    assert.equal(data.summary.marginBps, 5_000);
    assert.equal(data.summary.unknownCostRequests, 2);
    assert.equal(data.summary.coverageBps, 5_000);

    const known = data.rows.find((row) => row.modelId === "m1");

    assert.equal(known.requests, 2, "free and subscription calls are excluded");
    assert.equal(known.costMicros, 1_500_000);
    assert.equal(known.contributionMicros, 1_500_000);
    assert.equal(known.access, "paid");
    assert.equal(
      data.rows.reduce((total, row) => total + row.revenueMicros, 0),
      3_350_000,
      "the call outside the window is excluded",
    );
  } finally {
    await db.close();
  }
});

test("an unknown cost basis keeps revenue and contributes no cost", async () => {
  const db = await fixture();

  try {
    const data = await getPricingCommand(db, 30, NOW);
    const unknown = data.rows.find((row) => row.modelId === "m2");
    const ghost = data.rows.find((row) => row.modelId === "ghost");

    assert.equal(unknown.costMicros, null);
    assert.equal(unknown.contributionMicros, null);
    assert.equal(unknown.marginBps, null);
    assert.equal(unknown.costSource, "unknown");
    assert.equal(unknown.unknownCostRequests, 1);
    assert.equal(unknown.revenueMicros, 300_000);

    assert.equal(ghost.costMicros, null);
    assert.equal(ghost.contributionMicros, null);
    assert.equal(ghost.modelName, "ghost");
    assert.equal(ghost.family, "—");
    assert.equal(ghost.revenueMicros, 50_000);
    assert.equal(ghost.inCatalog, false);
  } finally {
    await db.close();
  }
});

test("sorting puts unknown contribution last in both directions", async () => {
  const db = await fixture();

  try {
    const { rows } = await getPricingCommand(db, 30, NOW);
    const descending = sortPricingRows(rows, "contribution", "desc");
    const ascending = sortPricingRows(rows, "contribution", "asc");

    assert.deepEqual(
      descending.map((row) => row.modelId),
      ["m1", "ghost", "m2"],
    );
    assert.equal(ascending[0].modelId, "m1");
    assert.equal(ascending.at(-1).contributionMicros, null);

    const page = paginatePricingRows(descending, 2, 2);

    assert.equal(page.pageCount, 2);
    assert.equal(page.total, 3);
    assert.deepEqual(
      page.rows.map((row) => row.modelId),
      ["m2"],
    );
  } finally {
    await db.close();
  }
});

test("a preview version must match the current price and served cost", async () => {
  const db = await fixture();

  try {
    const current = {
      sellInputMicros: 1_000_000,
      sellOutputMicros: 2_000_000,
      costInputMicros: 500_000,
      costOutputMicros: 1_000_000,
    };

    const stale = await setModelPricingChecked(
      db,
      "m1",
      1_500_000,
      3_000_000,
      { ...current, costInputMicros: 400_000 },
      approval,
    );

    assert.equal(stale.status, "stale");
    assert.equal((await listPricingDecisions(db, 10)).length, 0);

    const approved = await setModelPricingChecked(
      db,
      "m1",
      1_500_000,
      3_000_000,
      current,
      approval,
    );

    assert.equal(approved.status, "ok");

    const [decision] = await listPricingDecisions(db, 10);

    assert.equal(decision.beforeInputMicros, 1_000_000);
    assert.equal(decision.afterInputMicros, 1_500_000);
    assert.equal(decision.reason, "Quarterly margin review");

    const replay = await setModelPricingChecked(
      db,
      "m1",
      2_000_000,
      4_000_000,
      current,
      approval,
    );

    assert.equal(replay.status, "stale");
    assert.equal((await listPricingDecisions(db, 10)).length, 1);

    const row = await db
      .prepare("SELECT sell_input_micros FROM models WHERE id = 'm1'")
      .get();

    assert.equal(Number(row.sell_input_micros), 1_500_000);

    const missing = await setModelPricingChecked(
      db,
      "missing",
      1,
      1,
      current,
      approval,
    );

    assert.equal(missing.status, "not_found");

    const free = await setModelPricingChecked(
      db,
      "free-row",
      1,
      1,
      {
        sellInputMicros: 0,
        sellOutputMicros: 0,
        costInputMicros: 0,
        costOutputMicros: 0,
      },
      approval,
    );

    assert.equal(free.status, "free");
  } finally {
    await db.close();
  }
});

test("version parsing and projection are integer-exact and refuse unknown cost", () => {
  const version = readPricingVersion({
    inputPricePer1M: 1,
    outputPricePer1M: 2,
    costInputPer1M: 0.5,
    costOutputPer1M: 1,
  });

  assert.deepEqual(version, {
    sellInputMicros: 1_000_000,
    sellOutputMicros: 2_000_000,
    costInputMicros: 500_000,
    costOutputMicros: 1_000_000,
  });
  assert.equal(
    pricingVersionMatches(version, {
      sellInputMicros: 1_000_000,
      sellOutputMicros: 2_000_000,
      costInputMicros: 500_000,
      costOutputMicros: 1_000_000,
    }),
    true,
  );
  assert.equal(
    readPricingVersion({
      inputPricePer1M: 1,
      outputPricePer1M: 2,
      costInputPer1M: 0.5,
    }),
    null,
  );
  assert.equal(
    readPricingVersion({
      inputPricePer1M: -1,
      outputPricePer1M: 2,
      costInputPer1M: 0.5,
      costOutputPer1M: 1,
    }),
    null,
  );

  const projected = projectPricingVolume(
    { requests: 2, inputTokens: 1_000_000, outputTokens: 1_000_000 },
    { inputMicros: 1_000_000, outputMicros: 2_000_000 },
    { inputMicros: 500_000, outputMicros: 1_000_000 },
    true,
  );

  assert.deepEqual(projected, {
    revenueMicros: 3_000_000,
    costMicros: 1_500_000,
    contributionMicros: 1_500_000,
    marginBps: 5_000,
  });
  assert.equal(
    projectPricingVolume(
      { requests: 2, inputTokens: 1_000_000, outputTokens: 1_000_000 },
      { inputMicros: 1_000_000, outputMicros: 2_000_000 },
      { inputMicros: 500_000, outputMicros: 1_000_000 },
      false,
    ),
    null,
  );

  assert.equal(normalizePricingWindow("90"), 90);
  assert.equal(normalizePricingWindow("0"), 30);
  assert.equal(normalizePricingWindow("999"), 30);
  assert.equal(normalizePricingWindow("nope"), 30);
});
