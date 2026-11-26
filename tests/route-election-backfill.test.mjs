import assert from "node:assert/strict";
import test from "node:test";

import { buildSyncedModels } from "../lib/providers/catalog.ts";
import {
  backfillRouteElection,
  ROUTE_ELECTION_VERSION,
  ROUTE_ELECTION_VERSION_KEY,
} from "../lib/storage/backfill.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import { listModels } from "../lib/storage/store/catalog.ts";
import { replaceModels } from "../lib/storage/store/model-sync.ts";
import { getSetting } from "../lib/storage/store/settings.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

/**
 * The boot repair for catalogues imported before FID-116 (FID-2026-1102-118).
 *
 * Before route groups were scoped to the billing tier, one election covered
 * every row in a group and a metered row could be imported, priced and active
 * but never published. The repair promotes the withheld row once; after the
 * version stamp, routing is authoritative.
 */

const UPSTREAM = [
  { id: "glm-5.3", dollarsPer1M: 0.15, outputDollarsPer1M: 0.15 },
  { id: "glm-5.4", dollarsPer1M: 0.2, outputDollarsPer1M: 0.2 },
];

const PROVIDER = { slug: "savant", kind: "openai" };

async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  // The Apinex seed is disabled (FID-2026-1126-001); the fixture serves this
  // catalog through that slug, so it enables the row directly.
  await db
    .prepare("UPDATE providers SET enabled = 1 WHERE slug = 'savant'")
    .run();

  await replaceModels(
    db,
    buildSyncedModels(PROVIDER, UPSTREAM, new Map(), "savant"),
    2_500,
    PROVIDER.slug,
  );

  return db;
}

/** The pre-fix shape: the first row owns the group, the second waits. */
async function withholdSecondRow(db) {
  await db
    .prepare("UPDATE models SET is_primary = 0 WHERE id = ?")
    .run("glm-5.4");
}

async function elections(db) {
  const rows = await db
    .prepare(
      "SELECT id, is_primary FROM models WHERE upstream_id IN (?, ?) ORDER BY id",
    )
    .all("glm-5.3", "glm-5.4");

  return Object.fromEntries(rows.map((row) => [row.id, Number(row.is_primary)]));
}

test("a catalogue elected before the tier-scoped rule is repaired on boot", async () => {
  const db = await fixture();

  await withholdSecondRow(db);
  assert.deepEqual(await elections(db), { "glm-5.3": 1, "glm-5.4": 0 });

  const result = await backfillRouteElection(db);

  assert.equal(result.changed, true);
  assert.equal(result.reconciled, 2);
  assert.deepEqual(await elections(db), { "glm-5.3": 1, "glm-5.4": 1 });
  assert.equal(
    await getSetting(db, ROUTE_ELECTION_VERSION_KEY),
    ROUTE_ELECTION_VERSION,
  );
});

test("the withheld row is published again", async () => {
  const db = await fixture();

  await withholdSecondRow(db);
  assert.deepEqual(
    (await listModels(db)).map((model) => model.id),
    ["glm-5.3"],
  );

  await backfillRouteElection(db);

  const published = (await listModels(db)).map((model) => model.id).sort();

  assert.deepEqual(published, ["glm-5.3", "glm-5.4"]);
});

test("the repair is version-stamped and does not run on every boot", async () => {
  const db = await fixture();

  const first = await backfillRouteElection(db);

  assert.equal(first.changed, true);

  // A later election is authoritative: the backfill is an upgrade step, not a
  // reconcile on every start, so it must not overwrite what routing decides
  // after this version.
  await withholdSecondRow(db);

  const second = await backfillRouteElection(db);

  assert.equal(second.changed, false);
  assert.equal(second.reconciled, 0);
  assert.deepEqual(await elections(db), { "glm-5.3": 1, "glm-5.4": 0 });
});
