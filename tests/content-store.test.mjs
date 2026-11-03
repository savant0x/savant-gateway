import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  addComment,
  briefingForUser,
  CommentRateLimitError,
  contentStats,
  countComments,
  createSource,
  deleteSource,
  getItem,
  getSource,
  isSaved,
  isWatching,
  listComments,
  listContentForModel,
  listItems,
  listSavedItems,
  listSources,
  listTags,
  replaceAutoLinks,
  setSaved,
  setWatch,
  updateSource,
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
        metrics: {
          views: 1200,
          likes: 42,
          comments: 7,
          rating: 4.6,
        },
      },
      "2026-11-02T11:00:00.000Z",
    );

    assert.match(itemId, /^itm_/);

    const stored = await getItem(db, itemId);

    assert.equal(stored.title, "GPT-6 Luna launch notes");
    assert.deepEqual(stored.metrics, {
      views: 1200,
      likes: 42,
      comments: 7,
      rating: 4.6,
    });
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

    const comment = await addComment(
      db,
      "user_dev",
      itemId,
      "First take.",
      { now: "2026-11-02T12:00:00.000Z" },
    );

    assert.equal(comment.authorName, "Local Developer");
    assert.equal(await countComments(db, itemId), 1);
    assert.equal((await listComments(db, itemId))[0].body, "First take.");

    for (let index = 1; index < 12; index += 1) {
      await addComment(
        db,
        "user_dev",
        itemId,
        `Comment ${index}`,
        { now: "2026-11-02T12:30:00.000Z" },
      );
    }

    await assert.rejects(
      () =>
        addComment(
          db,
          "user_dev",
          itemId,
          "Too many.",
          { now: "2026-11-02T12:45:00.000Z" },
        ),
      CommentRateLimitError,
    );

    assert.equal(await setWatch(db, "user_dev", MODEL_ID, false), false);
    assert.equal(await isWatching(db, "user_dev", MODEL_ID), false);
    assert.equal(await setSaved(db, "user_dev", itemId, false), false);

    assert.equal(await deleteSource(db, source.id), true);
    assert.equal((await listItems(db)).total, 0);
  } finally {
    await db.close();
  }
});

test("editing a source touches only that row and refuses an invalid URL", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const first = await createSource(db, {
      kind: "rss",
      label: "First feed",
      url: "https://example.com/first.xml",
      config: { tags: ["openai"] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 10,
    });
    const second = await createSource(db, {
      kind: "rss",
      label: "Second feed",
      url: "https://example.com/second.xml",
      config: { tags: ["luna"] },
      enabled: true,
      fetchIntervalMinutes: 30,
      maxItems: 5,
    });

    const updated = await updateSource(db, first.id, {
      kind: "rss",
      label: "First feed renamed",
      url: "https://example.com/first.xml",
      config: { tags: ["openai", "agents"] },
      enabled: true,
      fetchIntervalMinutes: 15,
      maxItems: 7,
    });

    assert.equal(updated.id, first.id);
    assert.equal(updated.label, "First feed renamed");
    assert.deepEqual(updated.config.tags, ["openai", "agents"]);
    assert.equal(updated.fetchIntervalMinutes, 15);
    assert.equal(updated.maxItems, 7);

    const untouched = await getSource(db, second.id);

    assert.equal(untouched.label, "Second feed");
    assert.deepEqual(untouched.config.tags, ["luna"]);
    assert.equal(untouched.fetchIntervalMinutes, 30);

    await assert.rejects(
      () =>
        updateSource(db, first.id, {
          kind: "rss",
          label: "First feed renamed",
          url: "http://127.0.0.1/feed",
          config: { tags: ["openai"] },
          enabled: true,
          fetchIntervalMinutes: 15,
          maxItems: 7,
        }),
      /not allowed|public|http/i,
    );

    const afterRefusal = await getSource(db, first.id);

    assert.equal(afterRefusal.url, "https://example.com/first.xml");
    assert.equal(afterRefusal.label, "First feed renamed");
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
