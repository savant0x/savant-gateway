import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresDatabase } from "../lib/storage/pg-adapter.ts";
import { contentSchema } from "../lib/storage/schema/content.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

/**
 * A database created before replies and skipped-cycle accounting has the old
 * comment table. `CREATE TABLE IF NOT EXISTS` does not add `parent_id`, so an
 * index on that column placed before the ALTER aborts the entire migration and
 * every page that opens storage fails. This test pins the upgrade order.
 */
const OLD_SCHEMA = `
  CREATE TABLE users (id TEXT PRIMARY KEY);

  CREATE SCHEMA content;

  CREATE TABLE content.sources (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    url TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    fetch_interval_minutes INTEGER NOT NULL DEFAULT 60,
    max_items INTEGER NOT NULL DEFAULT 20,
    status TEXT NOT NULL DEFAULT 'active',
    failure_streak INTEGER NOT NULL DEFAULT 0,
    last_fetched_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX content_sources_due_idx
    ON content.sources(enabled, status, last_fetched_at);

  CREATE TABLE content.items (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    published_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX content_items_url_key ON content.items(url);
  CREATE INDEX content_items_published_idx ON content.items(published_at DESC);
  CREATE INDEX content_items_source_idx ON content.items(source_id, published_at DESC);

  CREATE TABLE content.comments (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES content.items(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX content_comments_item_idx
    ON content.comments(item_id, created_at DESC);
  CREATE INDEX content_comments_user_idx
    ON content.comments(user_id, created_at DESC);

  CREATE TABLE content.metric_snapshots (
    item_id TEXT NOT NULL REFERENCES content.items(id) ON DELETE CASCADE,
    captured_at TEXT NOT NULL,
    views BIGINT NOT NULL DEFAULT 0,
    likes BIGINT NOT NULL DEFAULT 0,
    youtube_comments BIGINT NOT NULL DEFAULT 0,
    rating DOUBLE PRECISION,
    stars BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, captured_at)
  );
  CREATE INDEX content_metric_snapshots_captured_idx
    ON content.metric_snapshots(captured_at);
`;

test("an old content schema upgrades before the parent index is built", async () => {
  const { pool } = await createPgliteDatabase();
  const db = createPostgresDatabase({ pool });

  try {
    await db.exec(OLD_SCHEMA);
    await contentSchema(db);

    const columns = await db
      .prepare(
        `SELECT table_name, column_name
           FROM information_schema.columns
          WHERE table_schema = 'content'
            AND table_name IN ('comments', 'items', 'metric_snapshots',
                               'fetch_cycles')`,
      )
      .all();

    const has = (table, column) =>
      columns.some(
        (row) => row.table_name === table && row.column_name === column,
      );

    assert.equal(has("comments", "parent_id"), true);
    assert.equal(has("items", "comment_count"), true);
    assert.equal(has("metric_snapshots", "comments"), true);
    assert.equal(has("metric_snapshots", "youtube_comments"), false);
    assert.equal(has("fetch_cycles", "items_skipped"), true);

    const indexes = await db
      .prepare(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = 'content'
            AND indexname = 'content_comments_parent_idx'`,
      )
      .all();

    assert.equal(indexes.length, 1);

    await db.prepare("INSERT INTO users (id) VALUES ('user_old')").run();
    await db
      .prepare(
        `INSERT INTO content.items
           (id, source_id, kind, title, url, published_at)
         VALUES ('itm_old', 'src_old', 'article', 'Old item',
                 'https://example.com/old', ?)`,
      )
      .run("2026-11-03T09:00:00.000Z");
    await db
      .prepare(
        `INSERT INTO content.comments (id, item_id, user_id, body, created_at)
         VALUES ('cmt_parent', 'itm_old', 'user_old', 'Top', ?)`,
      )
      .run("2026-11-03T10:00:00.000Z");
    await db
      .prepare(
        `INSERT INTO content.comments
           (id, item_id, user_id, parent_id, body, created_at)
         VALUES ('cmt_reply', 'itm_old', 'user_old', 'cmt_parent', 'Reply', ?)`,
      )
      .run("2026-11-03T10:01:00.000Z");

    const stored = await db
      .prepare(
        "SELECT parent_id FROM content.comments WHERE id = 'cmt_reply'",
      )
      .get();

    assert.equal(stored.parent_id, "cmt_parent");
  } finally {
    await db.close();
  }
});
