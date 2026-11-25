import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  getBannerConfig,
  saveBannerConfig,
} from "../lib/storage/store/banner.ts";

import { createPgliteDatabase } from "./pglite-pool.mjs";

/**
 * The context banner is one read (FID-2026-1124-005, slice 4).
 *
 * Every completion needs the banner's text and its switch together. Reading
 * them one after another was two sequential round trips on the hot path; the
 * pair is now fetched in one statement, and this case asserts the count.
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

  return db;
}

test("the banner reads its text and switch in one statement", async () => {
  const db = await fixture();

  try {
    await saveBannerConfig(db, { enabled: true, text: "Be kind to each other." });

    const { handle, state } = counted(db);
    const banner = await getBannerConfig(handle);

    assert.equal(banner.enabled, true);
    assert.equal(banner.text, "Be kind to each other.");
    assert.equal(state.statements, 1, "one read for the pair");
  } finally {
    await db.close();
  }
});

test("an unset banner still costs one read and serves an empty text", async () => {
  const db = await fixture();

  try {
    const { handle, state } = counted(db);
    const banner = await getBannerConfig(handle);

    assert.deepEqual(banner, { enabled: false, text: "" });
    assert.equal(state.statements, 1);
  } finally {
    await db.close();
  }
});
