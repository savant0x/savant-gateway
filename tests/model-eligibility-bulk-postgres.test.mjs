import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  listProviderReviewModels,
  setModelEligibilityBulk,
} from "../lib/storage/store/eligibility.ts";
import { replaceModels } from "../lib/storage/store/model-sync.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

/**
 * One decision for a whole catalog.
 *
 * A review-required provider needs a dated chat decision per model before it can
 * publish or serve, and a synced catalog is hundreds of rows. The batch keeps the
 * evidence standard — one row per model, same source and date — and writes it in
 * one transaction with one republish, so the cost of approving a catalog stops
 * scaling with the click count.
 */
const NOW = "2026-11-06T00:00:00.000Z";

function model(index) {
  return {
    id: `p1/m${index}`,
    upstreamId: `m${index}`,
    upstreamSlug: "p1",
    routeGroup: `g${index}`,
    name: `Model ${index}`,
    family: "Test",
    protocol: "chat",
    costSource: "synced",
    contextWindow: "8k",
    tokenWeight: 0,
    costInputMicros: 1_000_000,
    costOutputMicros: 2_000_000,
    allowFree: false,
    supportsTools: false,
    supportsVision: false,
    health: null,
    sortOrder: index,
  };
}

async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO providers
        (slug, label, kind, base_url, key_env_var, default_headers, enabled,
         sort_order, status, requires_model_review, created_at, updated_at)
       VALUES ('p1', 'P1', 'openai', 'https://p1.test/v1', 'KEY_P1', '{}', 1, 0,
               'unconfigured', 1, ?, ?)`,
    )
    .run(NOW, NOW);

  return db;
}

test("a whole catalog is recorded in one call", async () => {
  const db = await fixture();

  try {
    await replaceModels(db, Array.from({ length: 200 }, (_, i) => model(i)), 2_500, "p1");

    const result = await setModelEligibilityBulk(
      db,
      {
        providerSlug: "p1",
        upstreamIds: Array.from({ length: 200 }, (_, i) => `m${i}`),
        decision: "chat",
        source: "operator",
      },
      NOW,
    );

    assert.deepEqual(result, { written: 200, skipped: [] });

    const rows = await db
      .prepare(
        "SELECT decision, source, observed_at FROM model_eligibility WHERE provider_slug = 'p1'",
      )
      .all();

    assert.equal(rows.length, 200);
    assert.ok(
      rows.every(
        (row) =>
          row.decision === "chat" &&
          row.source === "operator" &&
          row.observed_at === NOW,
      ),
      "every row carries the same decision, source and date",
    );
  } finally {
    await db.close();
  }
});

test("an id the provider does not serve is reported, not written", async () => {
  const db = await fixture();

  try {
    await replaceModels(db, [model(0), model(1)], 2_500, "p1");

    const result = await setModelEligibilityBulk(
      db,
      {
        providerSlug: "p1",
        upstreamIds: ["m0", "m1", "ghost", "m0"],
        decision: "chat",
      },
      NOW,
    );

    assert.deepEqual(result, { written: 2, skipped: ["ghost"] });

    const rows = await db
      .prepare("SELECT upstream_id FROM model_eligibility ORDER BY upstream_id")
      .all();

    assert.deepEqual(
      rows.map((row) => row.upstream_id),
      ["m0", "m1"],
      "a duplicate id is written once",
    );
  } finally {
    await db.close();
  }
});

test("an empty list and an unknown provider are refused", async () => {
  const db = await fixture();

  try {
    assert.equal(
      await setModelEligibilityBulk(db, {
        providerSlug: "p1",
        upstreamIds: [],
        decision: "chat",
      }),
      "empty",
    );

    assert.equal(
      await setModelEligibilityBulk(db, {
        providerSlug: "nobody",
        upstreamIds: ["m0"],
        decision: "chat",
      }),
      "provider_not_found",
    );
  } finally {
    await db.close();
  }
});

test("a later single decision overrides its row without touching the rest", async () => {
  const db = await fixture();

  try {
    await replaceModels(db, [model(0), model(1), model(2)], 2_500, "p1");

    await setModelEligibilityBulk(
      db,
      {
        providerSlug: "p1",
        upstreamIds: ["m0", "m1", "m2"],
        decision: "chat",
      },
      NOW,
    );

    const { setModelEligibility } = await import(
      "../lib/storage/store/eligibility.ts"
    );

    await setModelEligibility(
      db,
      {
        providerSlug: "p1",
        upstreamId: "m1",
        decision: "unsupported",
        note: "returns an image",
      },
      "2026-11-07T00:00:00.000Z",
    );

    const decisions = await listProviderReviewModels(db, "p1");
    const byId = new Map(decisions.map((row) => [row.upstreamId, row]));

    assert.equal(byId.get("m0").decision, "chat");
    assert.equal(byId.get("m1").decision, "unsupported");
    assert.equal(byId.get("m1").note, "returns an image");
    assert.equal(byId.get("m2").decision, "chat");
  } finally {
    await db.close();
  }
});

test("a bulk decision survives a delisting, like a single one", async () => {
  const db = await fixture();

  try {
    await replaceModels(db, [model(0)], 2_500, "p1");

    await setModelEligibilityBulk(
      db,
      { providerSlug: "p1", upstreamIds: ["m0"], decision: "chat" },
      NOW,
    );

    await replaceModels(db, [], 2_500, "p1");

    const rows = await db
      .prepare(
        "SELECT decision FROM model_eligibility WHERE provider_slug = 'p1' AND upstream_id = 'm0'",
      )
      .all();

    assert.equal(rows.length, 1, "the evidence outlives the catalog row");
    assert.equal(rows[0].decision, "chat");
  } finally {
    await db.close();
  }
});
