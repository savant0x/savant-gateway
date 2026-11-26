import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  countPublishedProviderModels,
  deleteProvider,
  getDefaultProvider,
  getDefaultProviderSlug,
  getProvider,
  listProviderRecords,
  setDefaultProvider,
} from "../lib/storage/store/providers.ts";
import { replaceModels } from "../lib/storage/store/model-sync.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-11-24T12:00:00.000Z";

/**
 * The default provider is a stored fact.
 *
 * It owns the unprefixed public id namespace, the published balance badge and the
 * metadata overlay, so "one holder" has to be a property of the database rather
 * than a rule a code path remembers to apply (FID-2026-1124-002).
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();

  return createStorageDatabase({ env: {}, pool });
}

function model(slug, id, index) {
  return {
    id,
    upstreamId: id.includes("/") ? id.slice(id.indexOf("/") + 1) : id,
    upstreamSlug: slug,
    routeGroup: `group-${index}`,
    name: `Model ${index}`,
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

async function defaults(db) {
  const rows = await db
    .prepare("SELECT slug FROM providers WHERE is_default = 1")
    .all();

  return rows.map((row) => row.slug);
}

test("a fresh database holds exactly one default, the seeded InferHub row", async () => {
  const db = await fixture();

  try {
    assert.deepEqual(await defaults(db), ["inferhub"]);
    assert.equal(await getDefaultProviderSlug(db), "inferhub");

    const provider = await getDefaultProvider(db);

    assert.equal(provider?.slug, "inferhub");
    assert.equal(provider?.isDefault, true, "the record carries the fact");
    assert.equal(provider?.enabled, true, "the default is the enabled upstream");
  } finally {
    await db.close();
  }
});

test("making another provider default moves it and leaves one holder", async () => {
  const db = await fixture();

  try {
    await replaceModels(db, [model("inferhub", "inferhub/glm-5.3", 1)], 2_500, "inferhub");
    await replaceModels(db, [model("savant", "gpt-6-astra", 2)], 2_500, "savant");

    const change = await setDefaultProvider(db, "savant", NOW);

    assert.deepEqual(change, {
      previousSlug: "inferhub",
      slug: "savant",
      previousPublishedIds: 1,
      publishedIds: 1,
    });
    assert.deepEqual(await defaults(db), ["savant"]);
    assert.equal(await getDefaultProviderSlug(db), "savant");
    assert.equal((await getProvider(db, "inferhub"))?.isDefault, false);
    assert.equal((await getProvider(db, "savant"))?.isDefault, true);
    assert.equal(
      (await getProvider(db, "savant"))?.enabled,
      true,
      "the election enables the target",
    );
    assert.equal(
      (await getProvider(db, "inferhub"))?.enabled,
      false,
      "and disables the previous upstream",
    );
  } finally {
    await db.close();
  }
});

test("the database refuses a second default", async () => {
  const db = await fixture();

  try {
    await assert.rejects(
      () =>
        db
          .prepare("UPDATE providers SET is_default = 1 WHERE slug = 'savant'")
          .run(),
      /unique|providers_default_idx/i,
    );
    assert.deepEqual(await defaults(db), ["inferhub"]);
  } finally {
    await db.close();
  }
});

test("the change reports the rows whose ids move, counted from the catalog", async () => {
  const db = await fixture();

  try {
    await replaceModels(
      db,
      [
        model("savant", "gpt-6-astra", 1),
        model("savant", "gpt-6-luna", 2),
        model("apixo", "apixo/glm-5.3", 3),
      ],
      2_500,
      "savant",
    );
    await replaceModels(db, [model("apixo", "apixo/glm-5.3", 1)], 2_500, "apixo");

    assert.equal(await countPublishedProviderModels(db, "savant"), 2);

    await setDefaultProvider(db, "savant", NOW);

    const change = await setDefaultProvider(db, "apixo", NOW);

    assert.equal(change?.previousPublishedIds, 2, "two bare ids gain a prefix");
    assert.equal(change?.publishedIds, 1, "one prefixed id loses it");
  } finally {
    await db.close();
  }
});

test("the delete guard follows the stored default, not a slug", async () => {
  const db = await fixture();

  try {
    assert.equal(await deleteProvider(db, "inferhub"), false, "the default stays");
    assert.ok(await getProvider(db, "inferhub"));

    await setDefaultProvider(db, "savant", NOW);

    assert.equal(
      await deleteProvider(db, "inferhub"),
      true,
      "once it is no longer the default it can be removed",
    );
    assert.equal(await getProvider(db, "inferhub"), undefined);
    assert.equal(
      await deleteProvider(db, "savant"),
      false,
      "the new default inherits the refusal",
    );
  } finally {
    await db.close();
  }
});

test("with no flag the fallback picks the enabled row with the lowest order", async () => {
  const db = await fixture();

  try {
    await db.prepare("UPDATE providers SET is_default = 0").run();

    assert.equal(
      await getDefaultProviderSlug(db),
      "inferhub",
      "the lowest sort_order enabled row",
    );

    await db
      .prepare("UPDATE providers SET enabled = 0 WHERE slug = 'inferhub'")
      .run();

    assert.equal(
      await getDefaultProviderSlug(db),
      "savant",
      "with nothing enabled, the lowest sort_order row is the deterministic pick",
    );
  } finally {
    await db.close();
  }
});

test("switching to the current default is a no-op that reports no movement", async () => {
  const db = await fixture();

  try {
    const change = await setDefaultProvider(db, "inferhub", NOW);

    assert.equal(change?.previousSlug, "inferhub");
    assert.equal(change?.previousPublishedIds, 0);
    assert.deepEqual(await defaults(db), ["inferhub"]);
    assert.ok((await listProviderRecords(db)).length > 0);
  } finally {
    await db.close();
  }
});

test("an unknown slug is refused and changes nothing", async () => {
  const db = await fixture();

  try {
    assert.equal(await setDefaultProvider(db, "absent", NOW), null);
    assert.deepEqual(await defaults(db), ["inferhub"]);
  } finally {
    await db.close();
  }
});
