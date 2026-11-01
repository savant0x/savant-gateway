import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import * as access from "../lib/store-facade/access.ts";
import * as catalog from "../lib/store-facade/catalog.ts";
import * as insights from "../lib/store-facade/insights.ts";
import * as money from "../lib/store-facade/money.ts";
import * as operations from "../lib/store-facade/operations.ts";
import { bindStoreRuntime } from "../lib/store-facade/runtime.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

/**
 * Façade surface (FID-086, step 4).
 *
 * The caller sweep is one atomic change, so a missing or miswired export would
 * surface as a red typecheck across forty-three files at once. This test fails
 * earlier and names the group: every façade export resolves, every wrapped
 * function returns a promise, and the few deliberately synchronous helpers are
 * still synchronous.
 */

const GROUPS = { access, catalog, insights, money, operations };

/** A list read may return an array or a page object; either must be empty. */
function emptyResult(value, label) {
  if (Array.isArray(value)) {
    assert.equal(value.length, 0, label);

    return;
  }

  assert.equal(typeof value, "object", label);
  assert.equal(Object.keys(value).length, 0, `${label} (got ${JSON.stringify(value)})`);
}

test("every façade group exposes a usable surface", () => {
  for (const [name, group] of Object.entries(GROUPS)) {
    const entries = Object.entries(group);

    assert.ok(entries.length > 0, `${name} exports nothing`);

    for (const [key, value] of entries) {
      // Two kinds of export are allowed: a wrapped function, or a policy
      // constant that deliberately stays synchronous (ANALYTICS_RANGES).
      assert.ok(
        typeof value === "function" || Array.isArray(value),
        `${name}.${key} is neither callable nor a policy constant (got ${typeof value})`,
      );
    }
  }

  assert.ok(Array.isArray(insights.ANALYTICS_RANGES));
  assert.equal(typeof insights.normalizeAnalyticsRange("7"), "number");
  assert.equal(typeof operations.utcDay(), "string");
});

test("wrapped functions resolve against one bound handle", async () => {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  bindStoreRuntime(async () => db);

  try {
    assert.equal(await access.authenticateApiKey("not-a-key"), null);
    emptyResult(await access.listUsage(1), "no usage yet");
    emptyResult(await money.listPlans(), "no plans yet");
    emptyResult(await operations.listSupportRequests(10), "no support requests yet");

    const pending = access.listUsage(5);

    assert.ok(pending instanceof Promise, "wrappers are awaited by callers");
    await pending;
  } finally {
    await db.close();
  }
});
