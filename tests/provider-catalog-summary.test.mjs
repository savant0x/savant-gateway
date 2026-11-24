import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { setModelEligibilityBulk } from "../lib/storage/store/eligibility.ts";
import { replaceModels } from "../lib/storage/store/model-sync.ts";
import { listProviderCatalogSummary } from "../lib/storage/store/provider-catalog.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

/**
 * The count that separates "enabled" from "able to serve".
 *
 * A review-required provider imports its whole catalog, prices it, and still
 * serves nothing until each row carries a dated `chat` decision. That number was
 * visible only inside the review modal, so an enabled provider with 150
 * undecided rows looked finished (FID-2026-1124-001).
 */
const NOW = "2026-11-24T00:00:00.000Z";

function model(upstreamSlug, index) {
  return {
    id: `${upstreamSlug}/m${index}`,
    upstreamId: `m${index}`,
    upstreamSlug,
    routeGroup: `${upstreamSlug}-g${index}`,
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

async function fixture(reviewed) {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  for (const [slug, requiresReview] of [
    ["reviewed", reviewed],
    ["open", 0],
  ]) {
    await db
      .prepare(
        `INSERT INTO providers
          (slug, label, kind, base_url, key_env_var, default_headers, enabled,
           sort_order, status, requires_model_review, created_at, updated_at)
         VALUES (?, ?, 'openai', ?, ?, '{}', 1, 0, 'active', ?, ?, ?)`,
      )
      .run(
        slug,
        slug,
        `https://${slug}.test/v1`,
        `KEY_${slug.toUpperCase()}`,
        requiresReview,
        NOW,
        NOW,
      );
    await replaceModels(
      db,
      [0, 1, 2].map((index) => model(slug, index)),
      2_500,
      slug,
    );
  }

  return db;
}

async function countFor(db, slug) {
  const summary = (await listProviderCatalogSummary(db)).find(
    (row) => row.slug === slug,
  );

  assert.ok(summary, `summary for ${slug}`);
  return summary.needsChatDecisionCount;
}

test("a review-required provider counts the rows that still need a decision", async () => {
  const db = await fixture(1);

  try {
    assert.equal(await countFor(db, "reviewed"), 3);

    await setModelEligibilityBulk(
      db,
      {
        providerSlug: "reviewed",
        upstreamIds: ["m0"],
        decision: "chat",
      },
      NOW,
    );

    assert.equal(await countFor(db, "reviewed"), 2, "a chat row stops counting");

    await setModelEligibilityBulk(
      db,
      {
        providerSlug: "reviewed",
        upstreamIds: ["m1"],
        decision: "unsupported",
      },
      NOW,
    );

    assert.equal(
      await countFor(db, "reviewed"),
      2,
      "an unsupported decision is a decision, but the row still cannot serve",
    );
  } finally {
    await db.close();
  }
});

test("a provider that does not require review never reports a backlog", async () => {
  const db = await fixture(0);

  try {
    assert.equal(await countFor(db, "reviewed"), 0);
    assert.equal(await countFor(db, "open"), 0);
  } finally {
    await db.close();
  }
});

test("a delisted row is not counted as awaiting a decision", async () => {
  const db = await fixture(1);

  try {
    await db
      .prepare("UPDATE models SET in_catalog = 0 WHERE id = 'reviewed/m0'")
      .run();

    assert.equal(await countFor(db, "reviewed"), 2);
  } finally {
    await db.close();
  }
});
