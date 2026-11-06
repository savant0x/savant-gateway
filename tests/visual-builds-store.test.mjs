import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import test from "node:test";

import { createPostgresDatabase } from "../lib/storage/pg-adapter.ts";
import { createPostgresPool } from "../lib/storage/pg-pool.ts";
import { migrateDatabase } from "../lib/storage/schema/index.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  getAdminShowcaseBuild,
  persistShowcaseSnapshot,
  publishShowcaseBuild,
  withdrawShowcaseBuild,
} from "../lib/storage/store/showcase-builds.ts";
import {
  getPublishedVisualBundle,
  getPublishedVisualBuild,
  getPublishedVisualThumbnail,
  listPublishedVisualBuilds,
} from "../lib/storage/store/showcase-public.ts";
import {
  appendShowcaseRights,
  upsertShowcaseSource,
} from "../lib/storage/store/showcase-sources.ts";
import { loadPelicanFixture, pelicanFixtureSource } from "../lib/visual-builds/pelican.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const ROOT = path.join(process.cwd(), "tests", "fixtures", "pelican");
const RESULT = "results/gpt-6-1-sol-high-run-01.json";
const SOURCE = pelicanFixtureSource();
const NOW = "2026-11-05T12:00:00.000Z";
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();

async function seed(
  db,
  source = SOURCE,
  modelId = "gpt-6.1-sol",
  upstreamId = modelId,
) {
  await upsertShowcaseSource(db, {
    id: source.id,
    label: source.label,
    baseUrl: source.baseUrl,
    revision: source.revision,
    enabled: true,
    maxStorageBytes: source.maxStorageBytes,
  });
  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, name, provider, context_window, synced_at,
         in_catalog, status, cost_source)
       VALUES (?, ?, 'GPT-6.1 Sol', 'OpenAI', '200k', ?, 1, 'active', 'synced')`,
    )
    .run(modelId, upstreamId, NOW);
}

async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await seed(db);

  return { db, snapshot: await loadPelicanFixture(ROOT, SOURCE, RESULT) };
}

function pgHandles(suffix) {
  return [
    createPostgresDatabase({
      pool: createPostgresPool({
        connectionString: TEST_DATABASE_URL,
        applicationName: `showcase_publish_${suffix}_a`,
      }),
    }),
    createPostgresDatabase({
      pool: createPostgresPool({
        connectionString: TEST_DATABASE_URL,
        applicationName: `showcase_publish_${suffix}_b`,
      }),
    }),
  ];
}

function rights(state, overrides = {}) {
  return {
    sourceId: SOURCE.id,
    state,
    evidenceUrl: "https://github.com/AzatJalilov/PelicanSdf",
    evidenceNote: "Pinned MIT repository copy for fixture verification.",
    evidenceSha256: "d77c45293bcb421f7d288400c497f8b1d8b44d470ea3be4ea05f681e69c1d73d",
    licenseText: "MIT License\n\nPermission is hereby granted, free of charge.",
    licenseSha256: "a".repeat(64),
    attribution: "Pelican SDF contributors",
    displayAllowed: true,
    cacheAllowed: true,
    redistributeAllowed: true,
    reviewer: "operator",
    reviewedAt: NOW,
    ...overrides,
  };
}

test("a build cannot publish before rights and then publishes as one snapshot", async () => {
  const { db, snapshot } = await fixture();

  try {
    const persisted = await persistShowcaseSnapshot(db, SOURCE.id, snapshot);

    assert.equal(persisted.created, true);
    assert.equal(persisted.match.state, "matched");
    assert.equal(persisted.match.modelId, "gpt-6.1-sol");

    const blocked = await publishShowcaseBuild(db, {
      buildId: persisted.buildId,
      reviewer: "operator",
      note: "first review",
    });

    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "rights");

    await appendShowcaseRights(db, rights("approved"));

    const published = await publishShowcaseBuild(db, {
      buildId: persisted.buildId,
      reviewer: "operator",
      note: "rights and binding checked",
    });

    assert.equal(published.ok, true);
    assert.equal(published.code, "published");

    const rows = await listPublishedVisualBuilds(db);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].buildId, persisted.buildId);
    assert.equal(rows[0].modelId, "gpt-6.1-sol");
    assert.equal(rows[0].title, "GPT-6.1 Sol / high effort");
    assert.match(rows[0].licenseText, /MIT License/);

    const detail = await getPublishedVisualBuild(db, persisted.buildId);
    const bundle = await getPublishedVisualBundle(db, persisted.buildId);
    const thumb = await getPublishedVisualThumbnail(db, persisted.buildId);

    assert.equal(detail?.revisionId, persisted.revisionId);
    assert.match(bundle?.html ?? "", /createPelicanSdf/);
    assert.equal(bundle?.sha256.length, 64);
    assert.equal(thumb?.bytes[0], 0xff);
    assert.equal(thumb?.sha256.length, 64);

    const admin = await getAdminShowcaseBuild(db, persisted.buildId);

    assert.equal(admin?.visibility, "published");
    assert.equal(admin?.bindingState, "accepted");
    assert.equal(admin?.catalogDigestMatches, true);
  } finally {
    await db.close();
  }
});

test("withdrawing rights or renaming the model removes a published build immediately", async () => {
  const { db, snapshot } = await fixture();

  try {
    const persisted = await persistShowcaseSnapshot(db, SOURCE.id, snapshot);

    await appendShowcaseRights(db, rights("approved"));
    assert.equal(
      (await publishShowcaseBuild(db, {
        buildId: persisted.buildId,
        reviewer: "operator",
        note: "publish",
      })).ok,
      true,
    );

    await appendShowcaseRights(db, rights("withdrawn"));

    assert.equal((await listPublishedVisualBuilds(db)).length, 0);
    assert.equal(await getPublishedVisualBuild(db, persisted.buildId), null);
    assert.equal(await getPublishedVisualBundle(db, persisted.buildId), null);
    assert.equal(await getPublishedVisualThumbnail(db, persisted.buildId), null);

    await appendShowcaseRights(db, rights("approved"));
    assert.equal((await listPublishedVisualBuilds(db)).length, 1);

    await db
      .prepare(`UPDATE models SET name = 'GPT-6.1 Sol Renamed' WHERE id = ?`)
      .run("gpt-6.1-sol");

    assert.equal((await listPublishedVisualBuilds(db)).length, 0);
    assert.equal(await getPublishedVisualBundle(db, persisted.buildId), null);

    await db
      .prepare(`UPDATE models SET name = 'GPT-6.1 Sol' WHERE id = ?`)
      .run("gpt-6.1-sol");

    assert.equal((await listPublishedVisualBuilds(db)).length, 1);

    await withdrawShowcaseBuild(db, {
      buildId: persisted.buildId,
      reviewer: "operator",
      note: "source request",
    });

    assert.equal((await listPublishedVisualBuilds(db)).length, 0);
  } finally {
    await db.close();
  }
});

test("a second import of the same record reuses its revision and cannot double-publish", async () => {
  const { db, snapshot } = await fixture();

  try {
    const first = await persistShowcaseSnapshot(db, SOURCE.id, snapshot);
    const second = await persistShowcaseSnapshot(db, SOURCE.id, snapshot);

    assert.equal(second.created, false);
    assert.equal(second.revisionId, first.revisionId);

    await appendShowcaseRights(db, rights("approved"));
    assert.equal(
      (await publishShowcaseBuild(db, {
        buildId: first.buildId,
        reviewer: "operator",
        note: "publish",
      })).code,
      "published",
    );
    assert.equal(
      (await publishShowcaseBuild(db, {
        buildId: first.buildId,
        reviewer: "operator",
        note: "again",
      })).code,
      "already_published",
    );
  } finally {
    await db.close();
  }
});

test("two connections cannot publish the same revision twice", async (context) => {
  if (!TEST_DATABASE_URL) {
    context.skip(
      "TEST_DATABASE_URL is required for the showcase publication race",
    );

    return;
  }

  const suffix = randomUUID().slice(0, 8);
  const [first, second] = pgHandles(suffix);
  const source = { ...SOURCE, id: `src_showcase_race_${suffix}` };
  const modelId = `model_showcase_race_${suffix}`;

  try {
    await migrateDatabase(first);
    await seed(first, source, modelId, "gpt-6.1-sol");

    const snapshot = await loadPelicanFixture(ROOT, source, RESULT);
    const persisted = await persistShowcaseSnapshot(first, source.id, snapshot);

    await appendShowcaseRights(
      first,
      rights("approved", { sourceId: source.id }),
    );

    const outcomes = await Promise.all([
      publishShowcaseBuild(first, {
        buildId: persisted.buildId,
        reviewer: "operator",
        note: "race a",
      }),
      publishShowcaseBuild(second, {
        buildId: persisted.buildId,
        reviewer: "operator",
        note: "race b",
      }),
    ]);

    assert.equal(
      outcomes.filter((outcome) => outcome.code === "published").length,
      1,
    );
    assert.equal(
      outcomes.filter((outcome) => outcome.code === "already_published").length,
      1,
    );

    const reviews = await first
      .prepare(
        "SELECT COUNT(*)::int AS total FROM showcase.reviews WHERE revision_id = ?",
      )
      .get(persisted.revisionId);
    const build = await first
      .prepare("SELECT visibility FROM showcase.builds WHERE id = ?")
      .get(persisted.buildId);

    assert.equal(Number(reviews.total), 1);
    assert.equal(build.visibility, "published");
  } finally {
    await first
      .prepare("DELETE FROM showcase.sources WHERE id = ?")
      .run(source.id)
      .catch(() => undefined);
    await first
      .prepare("DELETE FROM models WHERE id = ?")
      .run(modelId)
      .catch(() => undefined);
    await first.close();
    await second.close();
  }
});

test("the source storage quota is enforced before an import can grow", async () => {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  try {
    await upsertShowcaseSource(db, {
      id: SOURCE.id,
      label: SOURCE.label,
      baseUrl: SOURCE.baseUrl,
      revision: SOURCE.revision,
      enabled: true,
      maxStorageBytes: 100,
    });
    await db
      .prepare(
        `INSERT INTO models
          (id, upstream_id, name, provider, context_window, synced_at,
           in_catalog, status, cost_source)
         VALUES ('gpt-6.1-sol', 'gpt-6.1-sol', 'GPT-6.1 Sol', 'OpenAI',
                 '200k', ?, 1, 'active', 'synced')`,
      )
      .run(NOW);

    await assert.rejects(
      async () =>
        persistShowcaseSnapshot(
          db,
          SOURCE.id,
          await loadPelicanFixture(ROOT, SOURCE, RESULT),
        ),
      /quota/,
    );
  } finally {
    await db.close();
  }
});
