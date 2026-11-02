import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type {
  ContentItem,
  ContentKind,
  ContentPage,
  ContentSource,
  ContentTag,
  LinkableModel,
  ParsedItem,
} from "../types.ts";

import { createHash } from "node:crypto";

import { CONTENT_LIMITS } from "../policy.ts";
import { normalizeTags, tagLabel } from "../taxonomy.ts";

export type ItemRow = {
  id: string;
  source_id: string;
  source_label: string;
  kind: ContentKind;
  title: string;
  url: string;
  excerpt: string;
  body_html: string | null;
  author: string | null;
  published_at: string;
  fetched_at: string;
  thumbnail_url: string | null;
  video_id: string | null;
  external_id: string | null;
  tags_json: string;
};

function toItem(row: ItemRow): ContentItem {
  let tags: string[] = [];

  try {
    const parsed = JSON.parse(row.tags_json) as unknown;

    tags = normalizeTags(parsed);
  } catch {
    tags = [];
  }

  return {
    id: row.id,
    sourceId: row.source_id,
    sourceLabel: row.source_label,
    kind: row.kind,
    title: row.title,
    url: row.url,
    excerpt: row.excerpt,
    bodyHtml: row.body_html,
    author: row.author,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    thumbnailUrl: row.thumbnail_url,
    videoId: row.video_id,
    externalId: row.external_id,
    tags,
  };
}

const ITEM_COLUMNS = `
  i.id, i.source_id, s.label AS source_label, i.kind, i.title, i.url,
  i.excerpt, i.body_html, i.author, i.published_at, i.fetched_at,
  i.thumbnail_url, i.video_id, i.external_id,
  COALESCE(
    (SELECT json_agg(t.tag ORDER BY t.tag)
       FROM content.item_tags t WHERE t.item_id = i.id),
    '[]'::json
  )::text AS tags_json
`;

export type ItemQuery = {
  kind?: ContentKind;
  tag?: string;
  modelId?: string;
  sourceId?: string;
  savedByUserId?: string;
  search?: string;
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
        (id, source_id, kind, title, url, excerpt, body_html, author,
         published_at, fetched_at, thumbnail_url, video_id, external_id,
         content_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (url) DO UPDATE SET
         kind = EXCLUDED.kind,
         title = EXCLUDED.title,
         excerpt = EXCLUDED.excerpt,
         body_html = EXCLUDED.body_html,
         author = EXCLUDED.author,
         published_at = EXCLUDED.published_at,
         fetched_at = EXCLUDED.fetched_at,
         thumbnail_url = EXCLUDED.thumbnail_url,
         video_id = EXCLUDED.video_id,
         external_id = EXCLUDED.external_id,
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
      item.excerpt,
      item.bodyHtml,
      item.author,
      item.publishedAt,
      now,
      item.thumbnailUrl,
      item.videoId,
      item.externalId,
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

export async function countItems(db: PostgresDatabase): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS total FROM content.items")
    .get<{ total: number | string }>();

  return Number(row?.total ?? 0);
}
