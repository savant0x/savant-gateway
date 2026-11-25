import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { getPublishedModel } from "../lib/storage/store/catalog.ts";
import {
  trialOffer,
  trialOffers,
} from "../lib/storage/store/trial-offer.ts";

import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-31T12:00:00.000Z";

/**
 * Catalogue reads scale with the page, not with the row count.
 *
 * `GET /v1/models` used to issue one statement per model for the trial offer,
 * two for a paired model, from a single request against a ten-connection pool;
 * the retrieve endpoint loaded the whole catalogue to find one id. These cases
 * assert the issued-statement count, which is deployment-independent, rather
 * than a wall-clock number (FID-2026-1124-005, slice 1).
 */
function counted(db) {
  const state = { statements: 0 };
  const handle = new Proxy(db, {
    get(target, key, receiver) {
      if (key === "prepare") {
        return (sql) => {
          state.statements += 1;

          return target.prepare(sql);
        };
      }

      const value = Reflect.get(target, key, receiver);

      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return { handle, state };
}

async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO model_groups
        (slug, label, billing_mode, sort_order, is_system, created_at, updated_at)
       VALUES ('free', 'Free', 'free', 0, 0, ?, ?)
       ON CONFLICT (slug) DO NOTHING`,
    )
    .run(NOW, NOW);
  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, upstream_slug, name, provider, family, protocol,
         route_group, context_window, token_weight, in_catalog, group_slug,
         group_source, status, sort_order, synced_at, is_primary, cost_source,
         price_source, input_price_micros, output_price_micros,
         sell_input_micros, sell_output_micros)
       VALUES ('list-free', 'list-free', 'savant', 'List Free', 'Family',
               'Family', 'chat', 'list-free', '8k', 1, 1, 'free', 'auto',
               'active', 0, ?, 1, 'manual', 'manual', 0, 0, 0, 0)`,
    )
    .run(NOW);

  return db;
}

function withEnv(values, fn) {
  const previous = {
    enabled: process.env.TRIAL_ENABLED,
    pairs: process.env.TRIAL_MODEL_PAIRS,
  };

  return Promise.resolve()
    .then(() => {
      if ("enabled" in values) process.env.TRIAL_ENABLED = values.enabled;
      if ("pairs" in values) process.env.TRIAL_MODEL_PAIRS = values.pairs;
    })
    .then(fn)
    .finally(() => {
      if (previous.enabled === undefined) delete process.env.TRIAL_ENABLED;
      else process.env.TRIAL_ENABLED = previous.enabled;

      if (previous.pairs === undefined) delete process.env.TRIAL_MODEL_PAIRS;
      else process.env.TRIAL_MODEL_PAIRS = previous.pairs;
    });
}

test("a page of trial offers costs one statement however many models it has", async () => {
  const db = await fixture();

  try {
    await withEnv(
      {
        enabled: "true",
        pairs: JSON.stringify({ a: "a-paid", b: "b-paid", c: "c-paid" }),
      },
      async () => {
        const { handle, state } = counted(db);
        const offers = await trialOffers(handle, [
          "a",
          "b",
          "c",
          "d",
          "e",
        ]);

        assert.equal(state.statements, 1, "one read for the whole page");
        assert.equal(offers.size, 5);
        assert.equal(offers.get("d"), null, "an unpaired model offers nothing");
      },
    );
  } finally {
    await db.close();
  }
});

test("a disabled trial reads nothing and offers nothing", async () => {
  const db = await fixture();

  try {
    await withEnv({ enabled: "", pairs: JSON.stringify({ a: "a-paid" }) }, async () => {
      delete process.env.TRIAL_ENABLED;

      const { handle, state } = counted(db);
      const offers = await trialOffers(handle, ["a", "b"]);

      assert.equal(state.statements, 0, "the refusal happens before any I/O");
      assert.equal(offers.get("a"), null);
    });
  } finally {
    await db.close();
  }
});

test("an unpaired model is refused without a read", async () => {
  const db = await fixture();

  try {
    await withEnv({ enabled: "true", pairs: "{}" }, async () => {
      const { handle, state } = counted(db);

      assert.equal(await trialOffer(handle, "unpaired"), null);
      assert.equal(state.statements, 0);
    });
  } finally {
    await db.close();
  }
});

test("the published retrieve is one statement and keeps the public scope", async () => {
  const db = await fixture();

  try {
    const { handle, state } = counted(db);
    const found = await getPublishedModel(handle, "list-free");

    assert.equal(state.statements, 1, "no full-catalogue scan");
    assert.equal(found?.id, "list-free");

    const missing = await getPublishedModel(handle, "free/luna-1");

    assert.equal(missing, null);
    // One exact read, plus the bounded leaf read a display id needs
    // (FID-2026-1125-002) — never one read per catalog row.
    assert.equal(state.statements, 3, "one read per id, not one per row");
  } finally {
    await db.close();
  }
});
