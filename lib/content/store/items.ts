import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type {
  ContentItem,
  ContentKind,
  ContentPage,
  ContentTag,
  LinkableModel,
} from "../types.ts";

import { CONTENT_LIMITS } from "../policy.ts";
import { normalizeTags, tagLabel } from "../taxonomy.ts";

import { ITEM_COLUMNS, type ItemRow, toItem } from "./item-rows.ts";

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
  search = "",
): Promise<ContentTag[]> {
  const query = search.trim();
  const where = query ? "WHERE t.tag ILIKE ?" : "";
  const rows = await db
    .prepare(
      `SELECT t.tag, COUNT(*) AS count
         FROM content.item_tags t
         ${where}
        GROUP BY t.tag
        ORDER BY count DESC, t.tag ASC
        LIMIT ?`,
    )
    .all<{ tag: string; count: number | string }>(
      ...(query ? [`%${query}%`] : []),
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

export async function countItems(db: PostgresDatabase): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS total FROM content.items")
    .get<{ total: number | string }>();

  return Number(row?.total ?? 0);
}
