import assert from "node:assert/strict";
import test from "node:test";

import { microsToPrice } from "../lib/pricing.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import { trialOffer } from "../lib/storage/store/trial-offer.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-31T12:00:00.000Z";
const PAIRS = JSON.stringify({ "trial-free": "trial-paid" });

/**
 * The trial-to-paid offer on the target engine (FID-086).
 *
 * The offer is a published price, so the suite checks the refusals as carefully
 * as the success: a disabled trial, an unpaired model, a model whose cost is
 * unknown, and a pair that does not share a provider must all publish nothing.
 * A price shown is a price the gateway must charge.
 */

async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  for (const [slug, label] of [
    ["free", "Free"],
    ["paid", "Paid"],
  ]) {
    await db
      .prepare(
        `INSERT INTO model_groups
          (slug, label, billing_mode, sort_order, is_system, created_at, updated_at)
         VALUES (?, ?, ?, 0, 0, ?, ?)
         ON CONFLICT (slug) DO NOTHING`,
      )
      .run(slug, label, slug, NOW, NOW);
  }

  const models = [
    ["trial-free", "free", "synced", "0", "0", 1],
    ["trial-paid", "paid", "manual", "1000000", "2000000", 1],
    ["trial-unpriced", "paid", "unknown", "1000000", "2000000", 1],
    ["trial-hidden", "paid", "manual", "1000000", "2000000", 0],
  ];

  for (const [id, group, costSource, input, output, inCatalog] of models) {
    await db
      .prepare(
        `INSERT INTO models
          (id, upstream_id, upstream_slug, name, provider, family, protocol,
           context_window, token_weight, in_catalog, group_slug, group_source,
           status, sort_order, synced_at, cost_source, price_source,
           input_price_micros, output_price_micros, sell_input_micros,
           sell_output_micros)
         VALUES (?, ?, 'savant', ?, 'Family', 'Family', 'chat', '8k', 1, ?,
                 ?, 'manual', 'active', 0, ?, ?, 'manual', ?, ?, ?, ?)`,
      )
      .run(
        id,
        id,
        id,
        inCatalog,
        group,
        NOW,
        costSource,
        input,
        output,
        input,
        output,
      );
  }

  return db;
}

function withEnv(fn) {
  const previous = {
    enabled: process.env.TRIAL_ENABLED,
    pairs: process.env.TRIAL_MODEL_PAIRS,
  };

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous.enabled === undefined) delete process.env.TRIAL_ENABLED;
      else process.env.TRIAL_ENABLED = previous.enabled;

      if (previous.pairs === undefined) delete process.env.TRIAL_MODEL_PAIRS;
      else process.env.TRIAL_MODEL_PAIRS = previous.pairs;
    });
}

test("an enabled pair publishes the paid model and its rates", async () => {
  const db = await fixture();

  try {
    await withEnv(async () => {
      process.env.TRIAL_ENABLED = "true";
      process.env.TRIAL_MODEL_PAIRS = PAIRS;

      const offer = await trialOffer(db, "trial-free");

      assert.deepEqual(offer, {
        paid_model_id: "trial-paid",
        input_price_per_1m: microsToPrice(1_000_000),
        output_price_per_1m: microsToPrice(2_000_000),
      });
    });
  } finally {
    await db.close();
  }
});

test("a disabled trial offers nothing", async () => {
  const db = await fixture();

  try {
    await withEnv(async () => {
      delete process.env.TRIAL_ENABLED;
      process.env.TRIAL_MODEL_PAIRS = PAIRS;

      assert.equal(await trialOffer(db, "trial-free"), null);
    });
  } finally {
    await db.close();
  }
});

test("a model with no pair is not offered a paid route", async () => {
  const db = await fixture();

  try {
    await withEnv(async () => {
      process.env.TRIAL_ENABLED = "true";
      process.env.TRIAL_MODEL_PAIRS = PAIRS;

      assert.equal(await trialOffer(db, "trial-unpriced"), null);
    });
  } finally {
    await db.close();
  }
});

test("an unknown cost or a hidden paid row publishes no price", async () => {
  const db = await fixture();

  try {
    await withEnv(async () => {
      process.env.TRIAL_ENABLED = "true";
      process.env.TRIAL_MODEL_PAIRS = JSON.stringify({
        "trial-free": "trial-unpriced",
        "trial-paid": "trial-hidden",
      });

      assert.equal(
        await trialOffer(db, "trial-free"),
        null,
        "an unknown cost is not a price",
      );
      assert.equal(
        await trialOffer(db, "trial-paid"),
        null,
        "a row withheld from the catalog is not offered",
      );
    });
  } finally {
    await db.close();
  }
});
