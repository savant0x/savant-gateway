import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  clearPublicCatalogCache,
  listModels,
} from "../lib/storage/store/catalog.ts";
import { getLandingData } from "../lib/storage/store/overview.ts";
import { refreshProvidersIfDue } from "../lib/storage/providers/freshness.ts";
import {
  claimProviderSync,
  releaseProviderSync,
} from "../lib/storage/providers/lease.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-31T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const INTERVAL = 6 * 60 * 60 * 1000;
const FLOOR = 5 * 60 * 1000;

/**
 * Catalog freshness and its display cache (FID-086, Batch B).
 *
 * Two properties keep the public catalog both correct and cheap:
 *
 * 1. The projection is memoized for five seconds, keyed by database handle, so
 *    a page render is not a query per component — and one database's cache can
 *    never answer another's query.
 * 2. The refresh is stale-while-revalidate: only enabled, credentialed, stale
 *    providers are attempted, one run at a time, at most one attempt per five
 *    minutes, and a landed refresh invalidates the projection immediately.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO model_groups
        (slug, label, billing_mode, sort_order, is_system, created_at, updated_at)
       VALUES ('paid', 'Paid', 'paid', 0, 0, ?, ?)
       ON CONFLICT (slug) DO NOTHING`,
    )
    .run(NOW, NOW);

  return db;
}

async function addProvider(db, slug, options = {}) {
  await db
    .prepare(
      `INSERT INTO providers
        (slug, label, base_url, key_env_var, enabled, sort_order, synced_at,
         created_at, updated_at)
       VALUES (?, ?, 'https://example.test', ?, ?, 0, ?, ?, ?)`,
    )
    .run(
      slug,
      slug,
      options.keyEnvVar ?? `KEY_${slug.toUpperCase()}`,
      options.enabled === false ? 0 : 1,
      options.syncedAt ?? null,
      NOW,
      NOW,
    );
}

async function addModel(db, id) {
  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, upstream_slug, name, provider, family, protocol,
         route_group, cost_source, cost_observed_at, context_window,
         token_weight, input_price_micros, output_price_micros,
         sell_input_micros, sell_output_micros, price_source, in_catalog,
         allow_free, group_slug, group_source, supports_tools,
         supports_vision, health, status, sort_order, synced_at, is_primary)
       VALUES (?, ?, 'savant', ?, 'Family', 'Family', 'chat', ?, 'manual', ?,
               '8k', 1, 1000, 2000, 2000, 4000, 'manual', 1, 0, 'paid', 'auto',
               0, 0, NULL, 'active', 0, ?, 1)`,
    )
    .run(id, id, id, id, NOW, NOW);
}

test("the catalog projection is cached and cleared per handle", async () => {
  const db = await fixture();

  try {
    await addModel(db, "m1");

    assert.equal((await listModels(db)).length, 1);

    // The row is no longer publishable, but the display cache still serves it.
    await db
      .prepare("UPDATE providers SET enabled = 0 WHERE slug = 'savant'")
      .run();
    assert.equal(
      (await listModels(db)).length,
      1,
      "within the TTL the cached projection is served",
    );

    clearPublicCatalogCache(db);

    assert.equal(
      (await listModels(db)).length,
      0,
      "clearing makes a visibility change immediate",
    );

    // A second handle has its own cache; clearing this one must not touch it.
    await db
      .prepare("UPDATE providers SET enabled = 1 WHERE slug = 'savant'")
      .run();
    const other = await fixture();

    try {
      await addModel(other, "m2");
      assert.equal((await listModels(other)).length, 1);
      clearPublicCatalogCache(db);
      assert.equal(
        (await listModels(other)).length,
        1,
        "a cache is keyed by the database it describes",
      );
    } finally {
      await other.close();
    }
  } finally {
    await db.close();
  }
});

test("only stale, enabled and credentialed providers are refreshed", async () => {
  const db = await fixture();
  const attempted = [];

  process.env.KEY_DUE = "configured";
  process.env.KEY_FRESH = "configured";
  delete process.env.KEY_MISSING;

  try {
    await addProvider(db, "due", { keyEnvVar: "KEY_DUE" });
    await addProvider(db, "fresh", {
      keyEnvVar: "KEY_FRESH",
      syncedAt: NOW,
    });
    await addProvider(db, "missing", { keyEnvVar: "KEY_MISSING" });
    await addProvider(db, "off", { keyEnvVar: "KEY_DUE", enabled: false });

    const due = await refreshProvidersIfDue(db, {
      sync: async (slug) => {
        attempted.push(slug);
      },
      now: NOW_MS,
      intervalMs: INTERVAL,
    });

    assert.deepEqual(due, ["due"]);
    assert.deepEqual(attempted, ["due"]);

    const again = await refreshProvidersIfDue(db, {
      sync: async (slug) => attempted.push(slug),
      now: NOW_MS + 1000,
      intervalMs: INTERVAL,
    });

    assert.deepEqual(again, [], "a burst is held off by the attempt floor");
    assert.equal(attempted.length, 1);

    const later = await refreshProvidersIfDue(db, {
      sync: async (slug) => attempted.push(slug),
      now: NOW_MS + FLOOR,
      intervalMs: INTERVAL,
    });

    assert.deepEqual(later, ["due"], "the provider is still stale");
    assert.equal(attempted.length, 2);
  } finally {
    await db.close();
    delete process.env.KEY_DUE;
    delete process.env.KEY_FRESH;
  }
});

test("a live provider lease blocks another instance until release", async () => {
  const db = await fixture();

  try {
    assert.equal(
      await claimProviderSync(db, {
        slug: "one",
        owner: "instance-a",
        at: NOW,
        expiresAt: "2026-10-31T12:10:00.000Z",
      }),
      true,
    );
    assert.equal(
      await claimProviderSync(db, {
        slug: "one",
        owner: "instance-b",
        at: NOW,
        expiresAt: "2026-10-31T12:10:00.000Z",
      }),
      false,
    );

    await releaseProviderSync(db, "one", "instance-a");

    assert.equal(
      await claimProviderSync(db, {
        slug: "one",
        owner: "instance-b",
        at: "2026-10-31T12:00:01.000Z",
        expiresAt: "2026-10-31T12:10:01.000Z",
      }),
      true,
    );
  } finally {
    await db.close();
  }
});

test("a provider held by another instance is not refreshed", async () => {
  const db = await fixture();
  const attempted = [];

  process.env.KEY_ONE = "configured";

  try {
    await addProvider(db, "one", { keyEnvVar: "KEY_ONE" });
    await claimProviderSync(db, {
      slug: "one",
      owner: "other-instance",
      at: NOW,
      expiresAt: "2026-10-31T12:10:00.000Z",
    });

    const refreshed = await refreshProvidersIfDue(db, {
      sync: async (slug) => attempted.push(slug),
      now: NOW_MS,
      intervalMs: INTERVAL,
    });

    assert.deepEqual(refreshed, []);
    assert.deepEqual(attempted, []);
  } finally {
    await db.close();
    delete process.env.KEY_ONE;
  }
});

test("a failing provider does not stop the others", async () => {
  const db = await fixture();

  process.env.KEY_ONE = "configured";
  process.env.KEY_TWO = "configured";

  try {
    await addProvider(db, "one", { keyEnvVar: "KEY_ONE" });
    await addProvider(db, "two", { keyEnvVar: "KEY_TWO" });

    const attempted = await refreshProvidersIfDue(db, {
      sync: async (slug) => {
        if (slug === "one") throw new Error("upstream 500");
      },
      now: NOW_MS,
      intervalMs: INTERVAL,
    });

    assert.deepEqual(attempted, ["one", "two"]);
  } finally {
    await db.close();
    delete process.env.KEY_ONE;
    delete process.env.KEY_TWO;
  }
});

test("an interval of zero disables the automatic refresh", async () => {
  const db = await fixture();
  let calls = 0;

  process.env.KEY_ONE = "configured";

  try {
    await addProvider(db, "one", { keyEnvVar: "KEY_ONE" });

    assert.deepEqual(
      await refreshProvidersIfDue(db, {
        sync: async () => {
          calls += 1;
        },
        now: NOW_MS,
        intervalMs: 0,
      }),
      [],
    );
    assert.equal(calls, 0);
  } finally {
    await db.close();
    delete process.env.KEY_ONE;
  }
});

test("a landed refresh invalidates the catalog cache", async () => {
  const db = await fixture();
  let released = false;

  process.env.KEY_ONE = "configured";

  try {
    await addModel(db, "m1");
    await addProvider(db, "one", { keyEnvVar: "KEY_ONE" });

    assert.equal((await listModels(db)).length, 1);

    // The provider disappears upstream during the refresh.
    await db
      .prepare("UPDATE providers SET enabled = 0 WHERE slug = 'savant'")
      .run();

    await refreshProvidersIfDue(db, {
      sync: async () => {
        released = true;
      },
      now: NOW_MS,
      intervalMs: INTERVAL,
    });

    assert.equal(released, true);
    assert.equal(
      (await listModels(db)).length,
      0,
      "the render after a refresh sees the new catalog",
    );
  } finally {
    await db.close();
    delete process.env.KEY_ONE;
  }
});

test("the landing read starts a refresh without waiting for it", async () => {
  const db = await fixture();
  let started = 0;

  try {
    await addModel(db, "m1");

    const data = await getLandingData(db, async () => {
      started += 1;
    });

    assert.equal(data.models.length, 1, "the render serves stored rows");
    assert.equal(started, 0, "the refresh is started, not awaited");
    assert.ok(data.stats);
    assert.ok(data.provider);
  } finally {
    await db.close();
  }
});
