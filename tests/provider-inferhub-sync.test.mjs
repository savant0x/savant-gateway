import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { catalogSchema } from "../lib/storage/schema/catalog.ts";
import { getProvider } from "../lib/storage/store/providers.ts";
import { setProviderEnabled } from "../lib/storage/store/providers.ts";
import { syncProvider } from "../lib/storage/providers/sync.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-11-20T18:00:00.000Z";

/**
 * InferHub's catalog through the whole sync path (FID-2026-1120-001).
 *
 * The payload below is the real shape observed on 2026-11-20: a nested ask
 * ladder on provider-pinned ids, 241 `owned_by: "alias"` rows that name no
 * provider, a media row, and a row with no price at all. The provider row is the
 * one the migration seeds — disabled, review-required, free-pool resale refused —
 * so this suite proves the shipped registration imports what it should and
 * refuses what its terms forbid.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  return db;
}

function catalog(models) {
  return new Response(JSON.stringify({ object: "list", data: models }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const INFERHUB_ROWS = [
  {
    id: "cc/claude-opus-5-5",
    object: "model",
    owned_by: "cc",
    upstream_label: "Claude Opus 5.5",
    input_token_limit: 1000000,
    max_output_tokens: 128000,
    modality: "text,image",
    output_modality: null,
    pricing: {
      official_in: 5,
      official_out: 25,
      min_ask_in: 0.152,
      min_ask_out: 0.76,
      asks_in: [0.152, 0.2, 0.9],
      asks_out: [0.76, 1, 4.5],
    },
  },
  { id: "claude-opus-5.5", object: "model", owned_by: "alias", supports_cache: false },
  { id: "free/grok/grok-4.5", object: "model", owned_by: "grok" },
  { id: "cc/an-image-model", object: "model", owned_by: "cc", output_modality: "image" },
  { id: "cc/unpriced-row", object: "model", owned_by: "cc", modality: "text" },
];

test("the seeded InferHub row imports priced rows and refuses everything else", async () => {
  const db = await fixture();

  process.env.INFERHUB_API_KEY = "test-secret";

  try {
    await setProviderEnabled(db, "inferhub", true);

    const summary = await syncProvider(db, "inferhub", {
      request: async () => catalog(INFERHUB_ROWS),
      fetchBalance: async () => null,
      fetchSubscription: async () => null,
    });

    assert.equal(
      summary.imported,
      2,
      "only the priced row and the unpriced text row are imported",
    );

    const warnings = summary.warnings.join(" | ");

    assert.match(warnings, /1 upstream alias row/);
    assert.match(warnings, /1 upstream free-pool \(resale not permitted\) row/);
    assert.match(warnings, /1 upstream non-text output row/);

    const rows = await db
      .prepare(
        `SELECT id, upstream_id, route_group, family, cost_source,
                input_price_micros, output_price_micros, context_window, status,
                supports_vision
           FROM models WHERE upstream_slug = 'inferhub' ORDER BY id`,
      )
      .all();

    assert.deepEqual(
      rows.map((row) => row.id),
      ["inferhub/cc/claude-opus-5-5", "inferhub/cc/unpriced-row"],
      "a non-default provider is namespaced, and dropped ids leave no row",
    );

    const priced = rows[0];

    assert.equal(priced.upstream_id, "cc/claude-opus-5-5");
    assert.equal(
      priced.route_group,
      "claude-opus-5-5",
      "the provider prefix is not part of the identity",
    );
    assert.equal(priced.family, "Claude", "the publisher prefix is not a family");
    assert.equal(priced.cost_source, "synced");
    assert.equal(Number(priced.input_price_micros), 152000);
    assert.equal(Number(priced.output_price_micros), 760000);
    assert.equal(priced.context_window, "1000000");
    assert.equal(priced.status, "active");
    assert.equal(Number(priced.supports_vision), 1);

    const unpriced = rows[1];

    assert.equal(unpriced.cost_source, "unknown");
    assert.equal(
      unpriced.status,
      "disabled",
      "an unpriced row is never sold at $0",
    );
  } finally {
    delete process.env.INFERHUB_API_KEY;
    await db.close();
  }
});

test("the same catalog on a provider that may resell its free pool keeps the free row", async () => {
  const db = await fixture();

  process.env.INFERHUB_API_KEY = "test-secret";

  try {
    await db
      .prepare("UPDATE providers SET resale_free_pool = 1 WHERE slug = 'inferhub'")
      .run();
    await setProviderEnabled(db, "inferhub", true);

    const summary = await syncProvider(db, "inferhub", {
      request: async () => catalog(INFERHUB_ROWS),
      fetchBalance: async () => null,
      fetchSubscription: async () => null,
    });

    assert.equal(summary.imported, 3, "the free row is imported too");
    assert.equal(summary.free, 1);
    assert.doesNotMatch(summary.warnings.join(" "), /free-pool/);

    const free = await db
      .prepare(
        `SELECT id, cost_source, allow_free, token_weight, status
           FROM models WHERE upstream_slug = 'inferhub' AND id LIKE '%free%'`,
      )
      .all();

    assert.equal(free.length, 1);
    assert.equal(free[0].id, "inferhub/free/grok/grok-4.5");
    assert.equal(free[0].cost_source, "synced");
    assert.equal(Number(free[0].allow_free), 1);
    assert.equal(Number(free[0].token_weight), 1);
    assert.equal(free[0].status, "active");
  } finally {
    delete process.env.INFERHUB_API_KEY;
    await db.close();
  }
});

/**
 * The registered row's wallet read (FID-2026-1122-002).
 *
 * This provider publishes its balance on the vendor host, not under its
 * inference base URL, and the seeded row has to say so — otherwise the capital
 * panel reports "unavailable" for a provider whose wallet is the whole economic
 * question. The migration may fill that in once, but must never overwrite an
 * operator's edit.
 */
test("the seeded row names its balance URL and survives an operator edit", async () => {
  const db = await fixture();

  try {
    const seeded = await getProvider(db, "inferhub");

    assert.equal(seeded?.capabilities.balance, true);
    assert.equal(seeded?.balanceUrl, "https://inferhub.dev/api/me");
    assert.equal(seeded?.capabilities.subscription, false);

    await db
      .prepare(
        `UPDATE providers SET balance_url = 'https://example.test/wallet'
          WHERE slug = 'inferhub'`,
      )
      .run();

    await catalogSchema(db);

    const edited = await getProvider(db, "inferhub");

    assert.equal(edited?.balanceUrl, "https://example.test/wallet");
    assert.equal(edited?.capabilities.balance, true);
  } finally {
    await db.close();
  }
});
