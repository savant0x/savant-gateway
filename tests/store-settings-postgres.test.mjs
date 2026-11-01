import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_MARKUP_BPS } from "../lib/pricing.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  getMarkupBps,
  getSetting,
  saveMarkupBps,
  saveSetting,
} from "../lib/storage/store/settings.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

/**
 * Settings on the async handle.
 *
 * The upsert is the one statement in the store layer whose spelling survives the
 * dialect change unchanged, which makes it the cheapest place to prove that the
 * handle, the migration and a write goal all agree before the read path depends
 * on them.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();

  return createStorageDatabase({ env: {}, pool });
}

test("the migration seeds the default markup", async () => {
  const db = await fixture();

  assert.equal(await getMarkupBps(db), DEFAULT_MARKUP_BPS);
  assert.equal(DEFAULT_MARKUP_BPS, 2_500);
});

test("a missing setting reads as null, not as an error", async () => {
  const db = await fixture();

  assert.equal(await getSetting(db, "nothing.here"), null);
});

test("saving a setting twice updates the row instead of adding one", async () => {
  const db = await fixture();

  await saveSetting(db, "catalog.banner", "first", "2026-10-30T12:00:00.000Z");
  await saveSetting(db, "catalog.banner", "second", "2026-10-30T12:05:00.000Z");

  assert.equal(await getSetting(db, "catalog.banner"), "second");

  const rows = await db
    .prepare("SELECT COUNT(*) AS total FROM settings WHERE key = ?")
    .get("catalog.banner");

  assert.equal(
    Number(rows.total),
    1,
    "the primary key keeps one row per setting",
  );

  const stamped = await db
    .prepare("SELECT updated_at FROM settings WHERE key = ?")
    .get("catalog.banner");

  assert.equal(stamped.updated_at, "2026-10-30T12:05:00.000Z");
});

test("a saved markup round trips through the settings row", async () => {
  const db = await fixture();

  const saved = await saveMarkupBps(db, 4_000);

  assert.equal(saved, 4_000);
  assert.equal(await getMarkupBps(db), 4_000);

  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("pricing.markup_bps");

  assert.equal(
    row.value,
    "4000",
    "stored as text, which is what the settings table has always held",
  );
});

test("a negative markup is clamped rather than accepted", async () => {
  const db = await fixture();

  const saved = await saveMarkupBps(db, -500);

  assert.ok(saved >= 0, `expected a nonnegative markup, received ${saved}`);
  assert.equal(await getMarkupBps(db), saved);
});

test("a value that is not a number falls back to the default", async () => {
  const db = await fixture();

  await saveSetting(db, "pricing.markup_bps", "not-a-number");

  assert.equal(
    await getMarkupBps(db),
    DEFAULT_MARKUP_BPS,
    "a corrupt setting must not become a NaN price",
  );
});
