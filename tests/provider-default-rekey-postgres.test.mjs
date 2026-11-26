import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { setDefaultProvider } from "../lib/storage/store/providers.ts";
import { replaceModels } from "../lib/storage/store/model-sync.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-11-24T12:00:00.000Z";
const THEN = "2026-11-01T00:00:00.000Z";

/**
 * Switching the default re-keys the two affected providers.
 *
 * `models` is keyed by published id while `models_upstream_idx` is unique on
 * `(upstream_slug, upstream_id)`, so a flag-only switch makes the next sync of
 * either provider fail with `23505`. The switch therefore rewrites the ids, moves
 * the entitlements that follow a model, and leaves history alone
 * (FID-2026-1124-004).
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();

  return createStorageDatabase({ env: {}, pool });
}

function synced(slug, upstreamId, id, index) {
  return {
    id,
    upstreamId,
    upstreamSlug: slug,
    routeGroup: `group-${slug}-${upstreamId}`,
    name: `Model ${upstreamId}`,
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
    sortOrder: index * 10,
  };
}

/** Two providers with one overlapping upstream id and one provider-only id. */
async function seed(db) {
  // Two living providers for the switch: the Apinex seed ships disabled, so the
  // fixture enables it before serving a catalog through it.
  await db
    .prepare("UPDATE providers SET enabled = 1 WHERE slug = 'savant'")
    .run();

  await replaceModels(db, [synced("savant", "gpt-5", "gpt-5", 1)], 2_500, "savant");
  await replaceModels(
    db,
    [
      synced("inferhub", "gpt-5", "inferhub/gpt-5", 1),
      synced("inferhub", "foo", "inferhub/foo", 2),
    ],
    2_500,
    "inferhub",
  );

  await db
    .prepare(
      `UPDATE models
          SET group_source = 'manual', group_slug = 'paid',
              price_source = 'manual',
              sell_input_micros = 7777, sell_output_micros = 8888
        WHERE id = 'gpt-5'`,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO plans
        (id, slug, name, status, price_micros, currency, interval,
         included_weighted_tokens, overage_mode, overage_markup_bps,
         sort_order, created_at, updated_at)
       VALUES ('plan1', 'plan1', 'Plan', 'active', 0, 'usd', 'month', 0,
               'block', 0, 0, ?, ?)`,
    )
    .run(THEN, THEN);
  await db
    .prepare("INSERT INTO plan_models (plan_id, model_id) VALUES ('plan1', 'gpt-5')")
    .run();

  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES ('u1', 'u1@example.test', 'Customer', 'active', ?)`,
    )
    .run(THEN);
  await db
    .prepare(
      `INSERT INTO subscriptions
        (id, user_id, plan_id, status, source, plan_name_snapshot,
         price_micros_snapshot, currency_snapshot, interval_snapshot,
         included_weighted_tokens_snapshot, overage_mode_snapshot,
         overage_markup_bps_snapshot, current_period_start, current_period_end,
         created_at, updated_at)
       VALUES ('s1', 'u1', 'plan1', 'active', 'manual', 'Plan', 0, 'usd',
               'month', 0, 'block', 0, ?, ?, ?, ?)`,
    )
    .run(THEN, THEN, THEN, THEN);
  await db
    .prepare(
      "INSERT INTO subscription_models (subscription_id, model_id) VALUES ('s1', 'gpt-5')",
    )
    .run();

  await db
    .prepare(
      `INSERT INTO usage_events
        (id, user_id, model_id, input_tokens, output_tokens, weighted_tokens,
         cost_micros, status, latency_ms, created_at)
       VALUES ('ev1', 'u1', 'gpt-5', 1, 1, 1, 0, 'ok', 1, ?)`,
    )
    .run(THEN);

  await db
    .prepare(
      `INSERT INTO content.sources (id, kind, label, url, created_at, updated_at)
       VALUES ('src1', 'rss', 'Source', 'https://example.test/feed', ?, ?)`,
    )
    .run(THEN, THEN);
  await db
    .prepare(
      `INSERT INTO content.items
        (id, source_id, kind, title, url, published_at, fetched_at,
         content_hash, created_at, updated_at)
       VALUES ('item1', 'src1', 'article', 'Title', 'https://example.test/item',
               ?, ?, 'hash', ?, ?)`,
    )
    .run(THEN, THEN, THEN, THEN);
  await db
    .prepare(
      `INSERT INTO content.model_links
        (item_id, model_id, relation, relation_source, confidence, reason,
         reviewed, created_at, updated_at)
       VALUES ('item1', 'gpt-5', 'release', 'operator', 1, 'manual link', 1, ?, ?)`,
    )
    .run(THEN, THEN);
  await db
    .prepare(
      "INSERT INTO content.watches (user_id, model_id, created_at) VALUES ('u1', 'gpt-5', ?)",
    )
    .run(THEN);

  // The fixture starts from the pre-consolidation shape this suite exists to
  // migrate: `savant` is the sole enabled default and InferHub is a stored,
  // disabled second provider. The seeds now do the opposite (FID-2026-1126-001).
  await db
    .transaction(async () => {
      await db.prepare("UPDATE providers SET is_default = 0, enabled = 0").run();
      await db
        .prepare(
          "UPDATE providers SET is_default = 1, enabled = 1 WHERE slug = 'savant'",
        )
        .run();
    })
    .immediate();
}

async function ids(db) {
  const rows = await db
    .prepare(
      `SELECT id FROM models
        WHERE upstream_slug IN ('savant', 'inferhub') ORDER BY id`,
    )
    .all();

  return rows.map((row) => row.id);
}

async function column(db, sql) {
  const rows = await db.prepare(sql).all();

  return rows.map((row) => Object.values(row)[0]);
}

test("the switch re-keys both providers without a collision", async () => {
  const db = await fixture();

  try {
    await seed(db);

    const change = await setDefaultProvider(db, "inferhub", NOW);

    assert.equal(change?.previousSlug, "savant");
    assert.equal(change?.previousPublishedIds, 1);
    assert.equal(change?.publishedIds, 2);

    assert.deepEqual(await ids(db), [
      "foo",
      "gpt-5",
      "savant/gpt-5",
    ]);

    const duplicates = await column(
      db,
      `SELECT upstream_slug || ':' || upstream_id AS key FROM models
        GROUP BY upstream_slug, upstream_id HAVING COUNT(*) > 1`,
    );

    assert.deepEqual(duplicates, [], "models_upstream_idx holds no duplicate");
  } finally {
    await db.close();
  }
});

test("entitlements follow the model and history keeps its id", async () => {
  const db = await fixture();

  try {
    await seed(db);
    await setDefaultProvider(db, "inferhub", NOW);

    assert.deepEqual(await column(db, "SELECT model_id FROM plan_models"), [
      "savant/gpt-5",
    ]);
    assert.deepEqual(
      await column(db, "SELECT model_id FROM subscription_models"),
      ["savant/gpt-5"],
    );
    assert.deepEqual(await column(db, "SELECT model_id FROM content.model_links"), [
      "savant/gpt-5",
    ]);
    assert.deepEqual(await column(db, "SELECT model_id FROM content.watches"), [
      "savant/gpt-5",
    ]);

    assert.deepEqual(await column(db, "SELECT model_id FROM usage_events"), [
      "gpt-5",
    ], "usage history keeps the id it was sold under");

    const manual = await db
      .prepare(
        `SELECT group_slug, group_source, sell_input_micros, sell_output_micros
           FROM models WHERE id = 'savant/gpt-5'`,
      )
      .get();

    assert.equal(manual.group_source, "manual");
    assert.equal(manual.group_slug, "paid");
    assert.equal(Number(manual.sell_input_micros), 7777);
    assert.equal(Number(manual.sell_output_micros), 8888);
  } finally {
    await db.close();
  }
});

test("a sync after the switch succeeds and keeps the manual overrides", async () => {
  const db = await fixture();

  try {
    await seed(db);
    await setDefaultProvider(db, "inferhub", NOW);

    await replaceModels(
      db,
      [
        synced("inferhub", "gpt-5", "gpt-5", 1),
        synced("inferhub", "foo", "foo", 2),
      ],
      2_500,
      "inferhub",
    );
    await replaceModels(
      db,
      [synced("savant", "gpt-5", "savant/gpt-5", 1)],
      2_500,
      "savant",
    );

    assert.deepEqual(await ids(db), ["foo", "gpt-5", "savant/gpt-5"]);

    const kept = await db
      .prepare(
        `SELECT group_source, sell_input_micros FROM models
          WHERE upstream_slug = 'savant' AND upstream_id = 'gpt-5'`,
      )
      .get();

    assert.equal(kept.group_source, "manual");
    assert.equal(Number(kept.sell_input_micros), 7777);
  } finally {
    await db.close();
  }
});

test("switching back restores the original ids and entitlements", async () => {
  const db = await fixture();

  try {
    await seed(db);
    await setDefaultProvider(db, "inferhub", NOW);
    await setDefaultProvider(db, "savant", NOW);

    assert.deepEqual(await ids(db), [
      "gpt-5",
      "inferhub/foo",
      "inferhub/gpt-5",
    ]);
    assert.deepEqual(await column(db, "SELECT model_id FROM plan_models"), [
      "gpt-5",
    ]);
    assert.deepEqual(await column(db, "SELECT model_id FROM usage_events"), [
      "gpt-5",
    ]);
  } finally {
    await db.close();
  }
});

test("a target id owned by a third provider is refused before writing", async () => {
  const db = await fixture();

  try {
    await seed(db);
    await db
      .prepare(
        `INSERT INTO models (id, upstream_id, upstream_slug, name, provider,
           family, context_window, status, in_catalog, sort_order, synced_at)
         VALUES ('foo', 'foo', 'apixo', 'Squatter', 'Test', 'Test', '8k',
                 'active', 1, 0, ?)`,
      )
      .run(THEN);

    await assert.rejects(
      () => setDefaultProvider(db, "inferhub", NOW),
      /already owns/,
    );

    assert.deepEqual(await ids(db), [
      "gpt-5",
      "inferhub/foo",
      "inferhub/gpt-5",
    ]);
    assert.deepEqual(
      await column(db, "SELECT slug FROM providers WHERE is_default = 1"),
      ["savant"],
      "the flag did not move",
    );
  } finally {
    await db.close();
  }
});
