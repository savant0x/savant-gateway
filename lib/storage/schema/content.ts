import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Content tables (FID-2026-1102-088/089/091).
 *
 * The namespace is isolated from billing and catalog routing. `watches` and
 * `saved_items` reference `users` because retention needs the existing customer
 * identity, but nothing here references a ledger, hold, plan, or subscription.
 * A failed feed or a deleted source can therefore never block a payment or a
 * gateway request.
 *
 * Every statement is idempotent so the additive migration can run on every
 * boot. The composite primary keys on the link and engagement tables are the
 * idempotency rule; a retried fetch or toggle cannot create a duplicate.
 */
export async function contentSchema(db: PostgresDatabase) {
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS content;

    CREATE TABLE IF NOT EXISTS content.sources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL
        CHECK (kind IN ('rss', 'youtube', 'huggingface', 'trendshift',
                        'hackernews')),
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      fetch_interval_minutes INTEGER NOT NULL DEFAULT 60,
      max_items INTEGER NOT NULL DEFAULT 20,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'error', 'disabled')),
      failure_streak INTEGER NOT NULL DEFAULT 0,
      last_fetched_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS content_sources_due_idx
      ON content.sources(enabled, status, last_fetched_at);

    CREATE TABLE IF NOT EXISTS content.items (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES content.sources(id) ON DELETE CASCADE,
      kind TEXT NOT NULL
        CHECK (kind IN ('article', 'video', 'paper', 'repo', 'discussion')),
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      external_url TEXT,
      excerpt TEXT NOT NULL DEFAULT '',
      body_html TEXT,
      author TEXT,
      published_at TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      thumbnail_url TEXT,
      video_id TEXT,
      external_id TEXT,
      github_json TEXT,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS content_items_url_key
      ON content.items(url);
    CREATE INDEX IF NOT EXISTS content_items_published_idx
      ON content.items(published_at DESC);
    CREATE INDEX IF NOT EXISTS content_items_source_idx
      ON content.items(source_id, published_at DESC);

    CREATE TABLE IF NOT EXISTS content.item_tags (
      item_id TEXT NOT NULL REFERENCES content.items(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY (item_id, tag)
    );
    CREATE INDEX IF NOT EXISTS content_item_tags_tag_idx
      ON content.item_tags(tag);

    CREATE TABLE IF NOT EXISTS content.model_links (
      item_id TEXT NOT NULL REFERENCES content.items(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL,
      relation TEXT NOT NULL
        CHECK (relation IN ('release', 'benchmark', 'hands_on', 'discussion',
                            'repository', 'paper', 'mention')),
      relation_source TEXT NOT NULL DEFAULT 'auto'
        CHECK (relation_source IN ('auto', 'operator')),
      confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      reviewed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (item_id, model_id)
    );
    CREATE INDEX IF NOT EXISTS content_model_links_model_idx
      ON content.model_links(model_id, reviewed);

    CREATE TABLE IF NOT EXISTS content.fetch_cycles (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES content.sources(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'error')),
      started_at TEXT NOT NULL,
      finished_at TEXT,
      items_seen INTEGER NOT NULL DEFAULT 0,
      items_upserted INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS content_fetch_cycles_source_idx
      ON content.fetch_cycles(source_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS content.watches (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, model_id)
    );
    CREATE INDEX IF NOT EXISTS content_watches_model_idx
      ON content.watches(model_id);

    CREATE TABLE IF NOT EXISTS content.saved_items (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES content.items(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS content_saved_items_user_idx
      ON content.saved_items(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS content.comments (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES content.items(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS content_comments_item_idx
      ON content.comments(item_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS content_comments_user_idx
      ON content.comments(user_id, created_at DESC);
  `);

  // Upstream engagement arrived after the first content release. The feed gives
  // views and a star average; the Data API adds likes and the YouTube comment
  // count. Additive so existing items keep their zeros until the next fetch.
  // The identifiers are literals in this file, not caller input, which is why
  // this is written directly rather than through ensureColumn (public schema).
  await db.exec(`
    ALTER TABLE IF EXISTS content.items
      ADD COLUMN IF NOT EXISTS view_count BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS like_count BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS youtube_comment_count BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS rating DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS github_json TEXT,
      ADD COLUMN IF NOT EXISTS external_url TEXT;

    -- Postgres auto-named the original inline check sources_kind_check in
    -- databases created before the content schema was qualified. A migration
    -- that drops only the qualified name leaves the old two-kind constraint in
    -- place, so new kinds are rejected even though a new check exists. Drop
    -- both names before adding the current one. This is idempotent.
    ALTER TABLE IF EXISTS content.sources
      DROP CONSTRAINT IF EXISTS sources_kind_check;
    ALTER TABLE IF EXISTS content.sources
      DROP CONSTRAINT IF EXISTS content_sources_kind_check;
    ALTER TABLE IF EXISTS content.sources
      ADD CONSTRAINT content_sources_kind_check
      CHECK (kind IN ('rss', 'youtube', 'huggingface', 'trendshift',
                      'hackernews'));
  `);
}
