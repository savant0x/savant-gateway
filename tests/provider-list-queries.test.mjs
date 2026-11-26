import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  getProviderStatusBySlug,
  listProviders,
} from "../lib/storage/store/providers.ts";

import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-31T12:00:00.000Z";

/**
 * The provider registry page is two statements (FID-2026-1124-005, slice 5).
 *
 * The list read every provider row, then re-read each provider by slug and
 * counted its catalog one query at a time. On a page that already held the rows,
 * that is 1 + 2N statements. These cases assert the count does not move when the
 * registry grows, and that the grouped count and derived status still agree with
 * the single-provider read.
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

  return createStorageDatabase({ env: {}, pool });
}

async function addProviders(db, count, offset = 0) {
  for (let index = 0; index < count; index += 1) {
    const slug = `extra${offset + index}`;

    await db
      .prepare(
        `INSERT INTO providers
          (slug, label, kind, base_url, key_env_var, default_headers, enabled,
           sort_order, status, created_at, updated_at)
         VALUES (?, ?, 'openai', 'https://example.test/v1', ?, '{}', 0, ?, 
                 'unconfigured', ?, ?)`,
      )
      .run(
        slug,
        slug,
        `KEY_${slug.toUpperCase()}`,
        offset + index,
        NOW,
        NOW,
      );
  }
}

test("the list costs the same statements for one provider and for twenty", async () => {
  const db = await fixture();

  try {
    await addProviders(db, 1);

    const first = counted(db);

    await listProviders(first.handle);

    assert.equal(first.state.statements, 2, "one row read and one grouped count");

    await addProviders(db, 19, 1);

    const second = counted(db);

    await listProviders(second.handle);

    assert.equal(
      second.state.statements,
      first.state.statements,
      "twenty providers cost what one did",
    );

    const third = counted(db);

    await listProviders(third.handle);

    assert.equal(
      third.state.statements,
      2,
      "even with the seeded registry the count is constant",
    );
  } finally {
    await db.close();
  }
});

test("the grouped count and the derived status agree with the single read", async () => {
  const db = await fixture();

  try {
    for (const [id, inCatalog] of [
      ["savant/one", 1],
      ["savant/two", 1],
      ["savant/gone", 0],
    ]) {
      await db
        .prepare(
          `INSERT INTO models
            (id, upstream_id, upstream_slug, name, provider, family, protocol,
             context_window, in_catalog, group_slug, status,
             sort_order, synced_at)
           VALUES (?, ?, 'savant', ?, 'Family', 'Family', 'chat', '8k', ?,
                   'paid', 'active', 0, ?)`,
        )
        .run(id, id, id, inCatalog, NOW);
    }

    const providers = await listProviders(db);
    const savant = providers.find((provider) => provider.slug === "savant");
    const status = await getProviderStatusBySlug(db, "savant");

    assert.equal(
      savant?.modelCount,
      2,
      "a delisted row is not counted as a published model",
    );
    assert.equal(
      savant?.status,
      status.status,
      "the list derives the same status as the single read",
    );
    assert.equal(savant?.configured, status.configured);
    assert.equal(providers.length, 5, "the five seeded registry rows");
  } finally {
    await db.close();
  }
});
