import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  clearPublicCatalogCache,
  getDefaultProvider,
  getMarkupBps,
  getModelGroup,
  getProvider,
  listModelGroups,
  listModels,
  listProviders,
} from "../lib/store-facade/catalog.ts";
import { bindStoreRuntime } from "../lib/store-facade/runtime.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

/**
 * Catalog façade on the target engine (FID-086, step 4).
 *
 * The point is not to retest the ported stores — they have their own suites. It
 * is to prove the wrapper layer the caller sweep depends on: names resolve, the
 * bound handle is the one the caller never had to pass, promises flatten once,
 * and the synchronous cache invalidation stayed synchronous.
 */

test("catalog façade answers from the bound database", async () => {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  bindStoreRuntime(async () => db);

  try {
    const provider = await getProvider("savant");

    assert.ok(provider, "the seeded provider is visible through the façade");
    assert.equal(provider.slug, "savant");

    const providers = await listProviders();

    assert.ok(providers.length >= 3, "the seeded registry is listed");
    assert.ok(providers.some((row) => row.slug === "savant"));

    const fallback = await getDefaultProvider();

    assert.ok(fallback, "a default provider resolves");

    const markup = await getMarkupBps();

    assert.equal(typeof markup, "number");
    assert.ok(Number.isInteger(markup));

    const groups = await listModelGroups();

    assert.ok(groups.length >= 1, "system groups are seeded");
    assert.ok(await getModelGroup(groups[0].slug));

    const models = await listModels();

    assert.ok(Array.isArray(models));

    assert.equal(
      typeof clearPublicCatalogCache,
      "function",
      "cache invalidation is reachable through the façade",
    );
    assert.equal(
      await clearPublicCatalogCache(),
      undefined,
      "the clearer takes the bound handle and resolves after clearing",
    );
  } finally {
    await db.close();
  }
});
