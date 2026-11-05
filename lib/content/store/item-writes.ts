import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type { ContentSource, GitHubRepo, ParsedItem } from "../types.ts";

import { createHash } from "node:crypto";

import { normalizeTags } from "../taxonomy.ts";

import { githubJson } from "./item-rows.ts";

function itemIdFor(sourceId: string, url: string) {
  return `itm_${createHash("sha256")
    .update(`${sourceId}:${url}`)
    .digest("hex")
    .slice(0, 24)}`;
}

type SnapshotRow = {
  views: number | string;
  likes: number | string;
  comments: number | string;
  rating: number | string | null;
  stars: number | string;
};

export function numberOrZero(
  value: number | string | null | undefined,
): number {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}

/**
 * One snapshot per fetch only when a stored count changed. A first fetch stores
 * the baseline, which makes the item ineligible for a delta until a later
 * observation exists.
 */
async function writeMetricSnapshot(
  db: PostgresDatabase,
  itemId: string,
  item: ParsedItem,
  now: string,
): Promise<void> {
  const latest = await db
    .prepare(
      `SELECT views, likes, comments, rating, stars
         FROM content.metric_snapshots
        WHERE item_id = ?
        ORDER BY captured_at DESC
        LIMIT 1`,
    )
    .get<SnapshotRow>(itemId);
  const next = {
    views: item.metrics?.views ?? 0,
    likes: item.metrics?.likes ?? 0,
    comments: item.metrics?.comments ?? 0,
    stars: item.github?.stars ?? 0,
    rating: item.metrics?.rating ?? null,
  };

  if (
    latest &&
    numberOrZero(latest.views) === next.views &&
    numberOrZero(latest.likes) === next.likes &&
    numberOrZero(latest.comments) === next.comments &&
    numberOrZero(latest.stars) === next.stars &&
    (latest.rating === null ? null : Number(latest.rating)) === next.rating
  ) {
    return;
  }

  await db
    .prepare(
      `INSERT INTO content.metric_snapshots
        (item_id, captured_at, views, likes, comments, rating, stars)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
    )
    .run(
      itemId,
      now,
      next.views,
      next.likes,
      next.comments,
      next.rating,
      next.stars,
    );
}

function contentHash(item: ParsedItem) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        item.title,
        item.url,
        item.externalUrl ?? null,
        item.excerpt,
        item.bodyHtml,
        item.author,
        item.publishedAt,
        item.tags,
      ]),
    )
    .digest("hex");
}

/**
 * Upserts on the canonical URL, not the source id, so the same story published
 * by two feeds produces one item. The later fetch updates the body and tags and
 * keeps the stable item id.
 */
async function upsertItemInTransaction(
  db: PostgresDatabase,
  source: ContentSource,
  item: ParsedItem,
  now = new Date().toISOString(),
): Promise<string> {
  const id = itemIdFor(source.id, item.url);
  const rows = await db
    .prepare(
      `INSERT INTO content.items
        (id, source_id, kind, title, url, external_url, excerpt, body_html,
         author, published_at, fetched_at, thumbnail_url, video_id, external_id,
         view_count, like_count, comment_count, rating, github_json,
         content_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (url) DO UPDATE SET
         kind = EXCLUDED.kind,
         title = EXCLUDED.title,
         external_url = EXCLUDED.external_url,
         excerpt = EXCLUDED.excerpt,
         body_html = COALESCE(EXCLUDED.body_html, content.items.body_html),
         author = EXCLUDED.author,
         published_at = EXCLUDED.published_at,
         fetched_at = EXCLUDED.fetched_at,
         thumbnail_url = EXCLUDED.thumbnail_url,
         video_id = EXCLUDED.video_id,
         external_id = EXCLUDED.external_id,
         view_count = EXCLUDED.view_count,
         like_count = EXCLUDED.like_count,
         comment_count = EXCLUDED.comment_count,
         rating = EXCLUDED.rating,
         github_json = COALESCE(EXCLUDED.github_json, content.items.github_json),
         content_hash = EXCLUDED.content_hash,
         updated_at = EXCLUDED.updated_at
       RETURNING id`,
    )
    .all<{ id: string }>(
      id,
      source.id,
      item.kind,
      item.title,
      item.url,
      item.externalUrl ?? null,
      item.excerpt,
      item.bodyHtml,
      item.author,
      item.publishedAt,
      now,
      item.thumbnailUrl,
      item.videoId,
      item.externalId,
      item.metrics?.views ?? 0,
      item.metrics?.likes ?? 0,
      item.metrics?.comments ?? 0,
      item.metrics?.rating ?? null,
      githubJson(item.github),
      contentHash(item),
      now,
      now,
    );

  const itemId = rows[0]?.id ?? id;
  const tags = normalizeTags(item.tags);

  await db
    .prepare("DELETE FROM content.item_tags WHERE item_id = ?")
    .run(itemId);

  for (const tag of tags) {
    await db
      .prepare(
        `INSERT INTO content.item_tags (item_id, tag)
         VALUES (?, ?) ON CONFLICT DO NOTHING`,
      )
      .run(itemId, tag);
  }

  await writeMetricSnapshot(db, itemId, item, now);

  return itemId;
}

/** Keep the stored item and its tag set consistent for matching readers. */
export async function upsertItem(
  db: PostgresDatabase,
  source: ContentSource,
  item: ParsedItem,
  now = new Date().toISOString(),
): Promise<string> {
  return db.transaction(() => upsertItemInTransaction(db, source, item, now))();
}

/** Persists a lazily fetched reader body so later views never refetch it. */
export async function saveItemBody(
  db: PostgresDatabase,
  itemId: string,
  bodyHtml: string,
  now = new Date().toISOString(),
): Promise<void> {
  await db
    .prepare(
      "UPDATE content.items SET body_html = ?, updated_at = ? WHERE id = ?",
    )
    .run(bodyHtml, now, itemId);
}

/** Persists lazily resolved repository facts and README for a legacy row. */
export async function saveItemGithub(
  db: PostgresDatabase,
  itemId: string,
  repo: GitHubRepo,
  now = new Date().toISOString(),
): Promise<void> {
  await db
    .prepare(
      "UPDATE content.items SET github_json = ?, updated_at = ? WHERE id = ?",
    )
    .run(githubJson(repo), now, itemId);
}
