import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  briefingForUser,
  contentStats,
  createSource,
  deleteSource,
  getItem,
  isSaved,
  isWatching,
  listContentForModel,
  listItems,
  listSavedItems,
  listSources,
  listTags,
  replaceAutoLinks,
  setSaved,
  setWatch,
  upsertItem,
} from "../lib/content/store.ts";

const MODEL_ID = "free/gpt-6-luna";

test("content store keeps sources, items, links, and retention isolated", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    await db
      .prepare(
        `INSERT INTO models
          (id, upstream_id, name, provider, family, context_window, token_weight,
           input_price_micros, output_price_micros, allow_free, supports_tools,
           supports_vision, status, sort_order, synced_at, in_catalog)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, 1)`,
      )
      .run(
        MODEL_ID,
        "gpt-6-luna",
        "GPT-6 Luna",
        "GPT",
        "GPT",
        "128000",
        1,
        0,
        0,
        1,
        0,
        0,
        "2026-11-02T00:00:00.000Z",
      );

    const source = await createSource(db, {
      kind: "rss",
      label: "Example feed",
      url: "https://example.com/feed.xml",
      config: { tags: ["OpenAI"] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 10,
    });

    assert.equal(source.status, "active");
    assert.deepEqual(source.config.tags, ["openai"]);
    assert.equal((await listSources(db)).length, 1);

    const itemId = await upsertItem(
      db,
      source,
      {
        externalId: "post-1",
        kind: "article",
        title: "GPT-6 Luna launch notes",
        url: "https://example.com/posts/luna",
        excerpt: "The release is here.",
        bodyHtml: "<p>The release is here.</p>",
        author: "Ada",
        publishedAt: "2026-11-02T10:00:00.000Z",
        thumbnailUrl: null,
        videoId: null,
        tags: ["openai", "gpt-6-luna"],
      },
      "2026-11-02T11:00:00.000Z",
    );

    assert.match(itemId, /^itm_/);
    assert.equal((await getItem(db, itemId)).title, "GPT-6 Luna launch notes");
    assert.deepEqual((await listTags(db)).map((tag) => tag.slug), [
      "gpt-6-luna",
      "openai",
    ]);
    assert.equal((await listItems(db, { tag: "openai" })).total, 1);

    await replaceAutoLinks(
      db,
      itemId,
      [
        {
          modelId: MODEL_ID,
          relation: "release",
          confidence: 1,
          reason: 'Title matches "GPT-6 Luna"',
          reviewed: true,
        },
      ],
      "2026-11-02T11:00:00.000Z",
    );

    const coverage = await listContentForModel(db, MODEL_ID);

    assert.equal(coverage.total, 1);
    assert.equal(coverage.items[0].relation, "release");
    assert.equal(coverage.items[0].reason, 'Title matches "GPT-6 Luna"');

    const stats = await contentStats(db);

    assert.equal(stats.sources, 1);
    assert.equal(stats.items, 1);
    assert.equal(stats.linkedItems, 1);
    assert.equal(stats.enabledSources, 1);

    assert.equal(await setWatch(db, "user_dev", MODEL_ID, true), true);
    assert.equal(await isWatching(db, "user_dev", MODEL_ID), true);
    assert.equal(await setWatch(db, "user_dev", MODEL_ID, true), true);
    assert.equal((await briefingForUser(db, "user_dev", new Date("2026-11-03T00:00:00.000Z"))).length, 1);

    assert.equal(await setSaved(db, "user_dev", itemId, true), true);
    assert.equal(await isSaved(db, "user_dev", itemId), true);
    assert.equal((await listSavedItems(db, "user_dev")).total, 1);

    assert.equal(await setWatch(db, "user_dev", MODEL_ID, false), false);
    assert.equal(await isWatching(db, "user_dev", MODEL_ID), false);
    assert.equal(await setSaved(db, "user_dev", itemId, false), false);

    assert.equal(await deleteSource(db, source.id), true);
    assert.equal((await listItems(db)).total, 0);
  } finally {
    await db.close();
  }
});

test("source creation refuses loopback and private destinations", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    for (const url of [
      "http://localhost/feed",
      "http://127.0.0.1/feed",
      "http://10.0.0.5/feed",
      "http://169.254.169.254/latest/meta-data",
      "file:///etc/passwd",
    ]) {
      await assert.rejects(
        createSource(db, {
          kind: "rss",
          label: "Bad",
          url,
          config: { tags: [] },
          enabled: true,
          fetchIntervalMinutes: 60,
          maxItems: 10,
        }),
        /not allowed|http|https|public|port/i,
      );
    }
  } finally {
    await db.close();
  }
});
