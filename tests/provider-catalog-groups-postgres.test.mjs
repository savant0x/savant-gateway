import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  listProviderCatalogGroups,
  replaceProviderCatalogGroups,
} from "../lib/storage/store/provider-catalog-groups.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-31T12:00:00.000Z";
const LATER = "2026-10-31T13:00:00.000Z";

/**
 * The snapshot is replaced, never merged.
 *
 * A group the vendor removed must stop being displayed, and one provider's read
 * must not touch another's rows: the table is the vendor's latest statement about
 * its own prefixes, not an accumulating history.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  for (const slug of ["a", "b"]) {
    await db
      .prepare(
        `INSERT INTO providers
          (slug, label, kind, base_url, key_env_var, default_headers, enabled,
           sort_order, status, created_at, updated_at)
         VALUES (?, ?, 'openai', 'https://example.test', ?, '{}', 1, 0,
                 'unconfigured', ?, ?)`,
      )
      .run(slug, slug.toUpperCase(), `KEY_${slug.toUpperCase()}`, NOW, NOW);
  }

  return db;
}

const group = (prefix, overrides = {}) => ({
  prefix,
  slug: `${prefix}-slug`,
  label: prefix,
  status: "available",
  enabled: true,
  activeProviders: 1,
  systemPromptNote: null,
  modelCount: 2,
  ...overrides,
});

test("a second read replaces the first", async () => {
  const db = await fixture();

  try {
    await replaceProviderCatalogGroups(db, "a", [group("one"), group("two")]);
    await replaceProviderCatalogGroups(
      db,
      "a",
      [group("two", { activeProviders: 40 })],
      LATER,
    );

    const snapshots = await listProviderCatalogGroups(db);

    assert.equal(snapshots.a.length, 1, "the removed prefix is gone");
    assert.equal(snapshots.a[0].prefix, "two");
    assert.equal(snapshots.a[0].activeProviders, 40);
    assert.equal(snapshots.a[0].syncedAt, LATER);
  } finally {
    await db.close();
  }
});

test("one provider's read leaves another provider's rows alone", async () => {
  const db = await fixture();

  try {
    await replaceProviderCatalogGroups(db, "a", [group("a-one")]);
    await replaceProviderCatalogGroups(db, "b", [group("b-one")]);
    await replaceProviderCatalogGroups(db, "a", [group("a-two")]);

    const snapshots = await listProviderCatalogGroups(db);

    assert.deepEqual(
      snapshots.a.map((row) => row.prefix),
      ["a-two"],
    );
    assert.deepEqual(
      snapshots.b.map((row) => row.prefix),
      ["b-one"],
    );
  } finally {
    await db.close();
  }
});

test("an empty read clears the snapshot instead of keeping stale rows", async () => {
  const db = await fixture();

  try {
    await replaceProviderCatalogGroups(db, "a", [group("one")]);
    await replaceProviderCatalogGroups(db, "a", []);

    const snapshots = await listProviderCatalogGroups(db);

    assert.equal(snapshots.a, undefined, "no rows, so no snapshot to show");
  } finally {
    await db.close();
  }
});

test("capacity and prompt notes survive the round trip, absent ones as null", async () => {
  const db = await fixture();

  try {
    await replaceProviderCatalogGroups(db, "a", [
      group("with-note", {
        activeProviders: 22_466,
        systemPromptNote: "Prepends a client header.",
      }),
      group("no-capacity", { activeProviders: null }),
    ]);

    const snapshots = await listProviderCatalogGroups(db);
    const [first, second] = snapshots.a;

    assert.equal(first.prefix, "with-note", "largest capacity first");
    assert.equal(first.activeProviders, 22_466);
    assert.equal(first.systemPromptNote, "Prepends a client header.");
    assert.equal(second.activeProviders, null);
  } finally {
    await db.close();
  }
});
