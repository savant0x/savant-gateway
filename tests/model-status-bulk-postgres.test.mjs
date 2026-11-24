import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { setModelEligibilityBulk } from "../lib/storage/store/eligibility.ts";
import { replaceModels } from "../lib/storage/store/model-sync.ts";
import {
  listAllModels,
  MAX_BULK_STATUS,
  setModelStatus,
  setModelStatusBulk,
} from "../lib/storage/store/models.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

/**
 * Switching a provider's models together.
 *
 * The operator asked for a way to enable or disable specific models from a
 * provider. The risk of a bulk switch is that it quietly does something
 * different from the single switch, so these cases pin the part that matters:
 * the same guard decides both, and every row a bulk action could not switch is
 * reported with its reason instead of disappearing (FID-2026-1123-003).
 */
const NOW = "2026-11-23T00:00:00.000Z";

function model(index, overrides = {}) {
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
    ...overrides,
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

async function statuses(db) {
  const rows = await db
    .prepare("SELECT id, status, in_catalog FROM models ORDER BY id")
    .all();

  return rows.map((row) => [row.id, row.status, Number(row.in_catalog)]);
}

test("a bulk disable switches every selected row in one call", async () => {
  const db = await fixture();

  try {
    await replaceModels(db, [0, 1, 2, 3, 4].map((i) => model(i)), 2_500, "p1");
    await setModelEligibilityBulk(
      db,
      {
        providerSlug: "p1",
        upstreamIds: ["m0", "m1", "m2", "m3", "m4"],
        decision: "chat",
      },
      NOW,
    );

    const enabled = await setModelStatusBulk(
      db,
      ["p1/m0", "p1/m1", "p1/m2", "p1/m3", "p1/m4"],
      "active",
    );

    assert.equal(
      typeof enabled === "object" && "written" in enabled ? enabled.written : -1,
      5,
    );

    const result = await setModelStatusBulk(
      db,
      ["p1/m0", "p1/m1"],
      "disabled",
    );

    assert.deepEqual(result, { written: 2, skipped: [] });

    const rows = await statuses(db);

    assert.deepEqual(
      rows.filter(([, status]) => status === "disabled").map(([id]) => id),
      ["p1/m0", "p1/m1"],
    );
  } finally {
    await db.close();
  }
});

test("an enable writes the eligible priced row and names every refusal", async () => {
  const db = await fixture();

  try {
    // m0 is priced and decided; m1 is priced but undecided; m2 is decided but
    // arrived unpriced; m3 will be delisted; ghost does not exist.
    await replaceModels(
      db,
      [
        model(0),
        model(1),
        model(2, { costSource: "unknown", costInputMicros: 0, costOutputMicros: 0 }),
        model(3),
      ],
      2_500,
      "p1",
    );
    await setModelEligibilityBulk(
      db,
      {
        providerSlug: "p1",
        upstreamIds: ["m0", "m2", "m3"],
        decision: "chat",
      },
      NOW,
    );
    await db
      .prepare(
        "UPDATE models SET cost_source = 'synced', input_price_micros = 1, output_price_micros = 1 WHERE id = 'p1/m0'",
      )
      .run();
    await db
      .prepare("UPDATE models SET in_catalog = 0 WHERE id = 'p1/m3'")
      .run();

    const result = await setModelStatusBulk(
      db,
      ["p1/m0", "p1/m1", "p1/m2", "p1/m3", "ghost"],
      "active",
    );

    assert.equal(
      typeof result === "object" && "written" in result ? result.written : -1,
      1,
    );

    const skipped =
      typeof result === "object" && "skipped" in result ? result.skipped : [];

    assert.deepEqual(
      skipped.sort((a, b) => a.id.localeCompare(b.id)),
      [
        { id: "ghost", reason: "not_found" },
        { id: "p1/m1", reason: "not_eligible" },
        { id: "p1/m2", reason: "cost_unknown" },
        { id: "p1/m3", reason: "delisted" },
      ],
    );

    const rows = await statuses(db);

    assert.equal(
      rows.find(([id]) => id === "p1/m0")?.[1],
      "active",
      "the eligible priced row is on",
    );
    assert.equal(
      rows.find(([id]) => id === "p1/m1")?.[1],
      "active",
      "a row that arrived priced was already on; the guard governs enabling",
    );
    assert.equal(
      rows.find(([id]) => id === "p1/m2")?.[1],
      "disabled",
      "the unpriced row the request tried to enable stays off",
    );
  } finally {
    await db.close();
  }
});

test("a duplicate id is written once and an empty selection is refused", async () => {
  const db = await fixture();

  try {
    await replaceModels(db, [model(0)], 2_500, "p1");

    assert.equal(await setModelStatusBulk(db, [], "disabled"), "empty");
    assert.equal(
      await setModelStatusBulk(
        db,
        Array.from({ length: MAX_BULK_STATUS + 1 }, (_, i) => `p1/x${i}`),
        "disabled",
      ),
      "too_many",
    );
    assert.deepEqual(
      await setModelStatusBulk(db, ["p1/m0", "p1/m0", "p1/m0"], "disabled"),
      { written: 1, skipped: [] },
    );
  } finally {
    await db.close();
  }
});

test("a switched-off row stays off after the next sync", async () => {
  const db = await fixture();

  try {
    await replaceModels(db, [model(0), model(1)], 2_500, "p1");
    await setModelStatusBulk(db, ["p1/m0"], "disabled");

    await replaceModels(db, [model(0), model(1)], 2_500, "p1");

    const rows = await statuses(db);

    assert.equal(
      rows.find(([id]) => id === "p1/m0")?.[1],
      "disabled",
      "the operator's switch is not reset by a sync",
    );
    assert.equal(rows.find(([id]) => id === "p1/m0")?.[2], 1, "still served");
    assert.equal(rows.find(([id]) => id === "p1/m1")?.[1], "active");
  } finally {
    await db.close();
  }
});

test("the single switch refuses a delisted row by name", async () => {
  const db = await fixture();

  try {
    await replaceModels(db, [model(0)], 2_500, "p1");
    await setModelEligibilityBulk(
      db,
      { providerSlug: "p1", upstreamIds: ["m0"], decision: "chat" },
      NOW,
    );
    await db.prepare("UPDATE models SET in_catalog = 0").run();

    assert.equal(await setModelStatus(db, "p1/m0", "active"), "delisted");
    assert.equal(
      (await listAllModels(db)).find((row) => row.id === "p1/m0")?.status,
      "active",
      "the refusal leaves the row untouched rather than switching it off",
    );
  } finally {
    await db.close();
  }
});
