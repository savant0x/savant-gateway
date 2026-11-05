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
        CHECK (kind IN ('rss', 'reddit', 'youtube', 'huggingface',
                        'trendshift', 'hackernews')),
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
      items_skipped INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS content_fetch_cycles_source_idx
      ON content.fetch_cycles(source_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS content.ingest_claims (
      source_id TEXT PRIMARY KEY REFERENCES content.sources(id) ON DELETE CASCADE,
      owner_token TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'claimed'
        CHECK (stage IN ('claimed', 'ingesting', 'done')),
      claimed_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS content_ingest_claims_expiry_idx
      ON content.ingest_claims(expires_at);

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
      parent_id TEXT REFERENCES content.comments(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS content_comments_item_idx
      ON content.comments(item_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS content_comments_user_idx
      ON content.comments(user_id, created_at DESC);
    -- The parent index is created after the ADD COLUMN below. On an existing
    -- database this CREATE TABLE is a no-op and parent_id does not exist yet,
    -- so indexing it here aborted the whole migration before it could upgrade
    -- the table.

    CREATE TABLE IF NOT EXISTS content.reactions (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES content.items(id) ON DELETE CASCADE,
      reaction TEXT NOT NULL CHECK (reaction IN ('useful', 'insightful')),
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, item_id, reaction)
    );
    CREATE INDEX IF NOT EXISTS content_reactions_item_idx
      ON content.reactions(item_id, reaction);

    -- One row per toggle attempt. The reaction table stores current state, so
    -- it cannot rate-limit a caller who repeatedly adds and removes the same
    -- reaction. This bounded log is the admission record for that write path.
    CREATE TABLE IF NOT EXISTS content.reaction_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS content_reaction_events_user_idx
      ON content.reaction_events(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS content.metric_snapshots (
      item_id TEXT NOT NULL REFERENCES content.items(id) ON DELETE CASCADE,
      captured_at TEXT NOT NULL,
      views BIGINT NOT NULL DEFAULT 0,
      likes BIGINT NOT NULL DEFAULT 0,
      comments BIGINT NOT NULL DEFAULT 0,
      rating DOUBLE PRECISION,
      stars BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (item_id, captured_at)
    );
    CREATE INDEX IF NOT EXISTS content_metric_snapshots_captured_idx
      ON content.metric_snapshots(captured_at);
  `);

  // Upstream engagement arrived after the first content release. The feed gives
  // views and a star average; the Data API adds likes and comments. The column
  // names are source-neutral because Hacker News and HuggingFace now report the
  // same metrics. Rename the legacy YouTube-named columns before the additive
  // ALTER, so an existing database keeps its counts under the new name.
  await renameContentColumn(
    db,
    "metric_snapshots",
    "youtube_comments",
    "comments",
  );
  await renameContentColumn(
    db,
    "items",
    "youtube_comment_count",
    "comment_count",
  );

  await db.exec(`
    ALTER TABLE IF EXISTS content.items
      ADD COLUMN IF NOT EXISTS view_count BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS like_count BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS comment_count BIGINT NOT NULL DEFAULT 0,
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
      CHECK (kind IN ('rss', 'reddit', 'youtube', 'huggingface',
                      'trendshift', 'hackernews'));

    -- Reply support arrived after the first discussion release. The CREATE
    -- above covers a fresh database; this branch upgrades an existing one.
    ALTER TABLE IF EXISTS content.comments
      ADD COLUMN IF NOT EXISTS parent_id TEXT
      REFERENCES content.comments(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS content_comments_parent_idx
      ON content.comments(parent_id, created_at ASC);

    ALTER TABLE IF EXISTS content.metric_snapshots
      ADD COLUMN IF NOT EXISTS comments BIGINT NOT NULL DEFAULT 0;

    ALTER TABLE IF EXISTS content.fetch_cycles
      ADD COLUMN IF NOT EXISTS items_skipped INTEGER NOT NULL DEFAULT 0;
  `);

  // A partially migrated database can hold both names; never drop the legacy
  // column silently. The current column keeps the larger observed value.
  await backfillColumnIfBoth(
    db,
    "metric_snapshots",
    "youtube_comments",
    "comments",
  );
  await backfillColumnIfBoth(
    db,
    "items",
    "youtube_comment_count",
    "comment_count",
  );
}

async function contentColumnExists(
  db: PostgresDatabase,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await db.query<{ present: number }>(
    `SELECT 1 AS present
       FROM information_schema.columns
      WHERE table_schema = 'content'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1`,
    [table, column],
  );

  return rows.length > 0;
}

async function renameContentColumn(
  db: PostgresDatabase,
  table: string,
  from: string,
  to: string,
): Promise<void> {
  if (!(await contentColumnExists(db, table, from))) return;
  if (await contentColumnExists(db, table, to)) return;

  await db.exec(`ALTER TABLE content.${table} RENAME COLUMN ${from} TO ${to}`);
}

async function backfillColumnIfBoth(
  db: PostgresDatabase,
  table: string,
  legacy: string,
  current: string,
): Promise<void> {
  if (!(await contentColumnExists(db, table, legacy))) return;
  if (!(await contentColumnExists(db, table, current))) return;

  await db.exec(
    `UPDATE content.${table}
        SET ${current} = GREATEST(${current}, ${legacy})
      WHERE ${current} < ${legacy}`,
  );
}
