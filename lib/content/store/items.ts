import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type {
  ContentItem,
  ContentKind,
  ContentPage,
  ContentSource,
  ContentTag,
  GitHubRepo,
  LinkableModel,
  ParsedItem,
} from "../types.ts";

import { createHash } from "node:crypto";

import { CONTENT_LIMITS } from "../policy.ts";
import { normalizeTags, tagLabel } from "../taxonomy.ts";

import { githubJson, ITEM_COLUMNS, type ItemRow, toItem } from "./item-rows.ts";

export type ItemQuery = {
  kind?: ContentKind;
  tag?: string;
  modelId?: string;
  sourceId?: string;
  savedByUserId?: string;
  search?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
};

function itemWhere(query: ItemQuery) {
  const clauses: string[] = [];
  const args: unknown[] = [];

  if (query.kind) {
    clauses.push("i.kind = ?");
    args.push(query.kind);
  }

  if (query.tag) {
    clauses.push(
      "EXISTS (SELECT 1 FROM content.item_tags t WHERE t.item_id = i.id AND t.tag = ?)",
    );
    args.push(query.tag);
  }

  if (query.modelId) {
    clauses.push(
      `EXISTS (SELECT 1 FROM content.model_links l
                WHERE l.item_id = i.id AND l.model_id = ? AND l.reviewed = 1)`,
    );
    args.push(query.modelId);
  }

  if (query.sourceId) {
    clauses.push("i.source_id = ?");
    args.push(query.sourceId);
  }

  if (query.savedByUserId) {
    clauses.push(
      `EXISTS (SELECT 1 FROM content.saved_items sv
                WHERE sv.item_id = i.id AND sv.user_id = ?)`,
    );
    args.push(query.savedByUserId);
  }

  if (query.search) {
    clauses.push("(i.title ILIKE ? OR i.excerpt ILIKE ?)");
    args.push(`%${query.search}%`, `%${query.search}%`);
  }

  if (query.since) {
    clauses.push("i.published_at >= ?");
    args.push(query.since);
  }

  if (query.until) {
    clauses.push("i.published_at < ?");
    args.push(query.until);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    args,
  };
}

export async function listItems(
  db: PostgresDatabase,
  query: ItemQuery = {},
): Promise<ContentPage> {
  const where = itemWhere(query);
  const limit = Math.min(
    CONTENT_LIMITS.maxPageSize,
    Math.max(1, query.limit ?? CONTENT_LIMITS.pageSize),
  );
  const offset = Math.max(0, query.offset ?? 0);

  const rows = await db
    .prepare(
      `SELECT ${ITEM_COLUMNS}
         FROM content.items i
         JOIN content.sources s ON s.id = i.source_id
         ${where.sql}
        ORDER BY i.published_at DESC, i.id DESC
        LIMIT ? OFFSET ?`,
    )
    .all<ItemRow>(...where.args, limit, offset);

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS total FROM content.items i ${where.sql}`)
    .get<{ total: number | string }>(...where.args);

  return {
    items: rows.map(toItem),
    total: Number(totalRow?.total ?? 0),
  };
}

export async function getItem(
  db: PostgresDatabase,
  id: string,
): Promise<ContentItem | null> {
  const row = await db
    .prepare(
      `SELECT ${ITEM_COLUMNS}
         FROM content.items i
         JOIN content.sources s ON s.id = i.source_id
        WHERE i.id = ?`,
    )
    .get<ItemRow>(id);

  return row ? toItem(row) : null;
}

export async function listRelatedItems(
  db: PostgresDatabase,
  itemId: string,
  tags: string[],
  limit = 4,
): Promise<ContentItem[]> {
  const usable = normalizeTags(tags).slice(0, 6);

  if (usable.length === 0) return [];

  const placeholders = usable.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT ${ITEM_COLUMNS}
         FROM content.items i
         JOIN content.sources s ON s.id = i.source_id
        WHERE i.id <> ?
          AND EXISTS (
            SELECT 1 FROM content.item_tags t
             WHERE t.item_id = i.id AND t.tag IN (${placeholders})
          )
        ORDER BY i.published_at DESC
        LIMIT ?`,
    )
    .all<ItemRow>(itemId, ...usable, Math.min(12, Math.max(1, limit)));

  return rows.map(toItem);
}

export async function listTags(
  db: PostgresDatabase,
  limit = 30,
): Promise<ContentTag[]> {
  const rows = await db
    .prepare(
      `SELECT t.tag, COUNT(*) AS count
         FROM content.item_tags t
        GROUP BY t.tag
        ORDER BY count DESC, t.tag ASC
        LIMIT ?`,
    )
    .all<{ tag: string; count: number | string }>(
      Math.min(100, Math.max(1, limit)),
    );

  return rows.map((row) => ({
    slug: row.tag,
    label: tagLabel(row.tag),
    count: Number(row.count),
  }));
}

export async function listLinkableModels(
  db: PostgresDatabase,
): Promise<LinkableModel[]> {
  return db
    .prepare(
      `SELECT id, name, family, upstream_id
         FROM models
        WHERE status = 'active' AND in_catalog = 1
        ORDER BY sort_order ASC, name ASC`,
    )
    .all<{
      id: string;
      name: string;
      family: string;
      upstream_id: string;
    }>()
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        family: row.family,
        upstreamId: row.upstream_id,
      })),
    );
}

function itemIdFor(sourceId: string, url: string) {
  return `itm_${createHash("sha256")
    .update(`${sourceId}:${url}`)
    .digest("hex")
    .slice(0, 24)}`;
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
export async function upsertItem(
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
         view_count, like_count, youtube_comment_count, rating, github_json,
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
         youtube_comment_count = EXCLUDED.youtube_comment_count,
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
      item.metrics?.youtubeComments ?? 0,
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

  return itemId;
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

export async function countItems(db: PostgresDatabase): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS total FROM content.items")
    .get<{ total: number | string }>();

  return Number(row?.total ?? 0);
}
