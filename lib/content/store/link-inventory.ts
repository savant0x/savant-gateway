import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type { ContentLinkState, ContentRelation } from "../types.ts";

import { CONTENT_LINK_STATES } from "../visibility.ts";

export type LinkInventoryQuery = {
  state?: ContentLinkState;
  modelId?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export type LinkInventoryRow = {
  itemId: string;
  itemTitle: string;
  modelId: string;
  relation: ContentRelation;
  relationSource: "auto" | "operator";
  reason: string;
  confidence: number;
  state: ContentLinkState;
  revision: number;
  createdAt: string;
};

export type LinkInventory = {
  links: LinkInventoryRow[];
  total: number;
  counts: Record<ContentLinkState, number>;
};

function where(query: LinkInventoryQuery) {
  const clauses: string[] = [];
  const args: unknown[] = [];

  if (query.state) {
    clauses.push("l.state = ?");
    args.push(query.state);
  }

  if (query.modelId) {
    clauses.push("l.model_id = ?");
    args.push(query.modelId);
  }

  if (query.search) {
    clauses.push("(i.title ILIKE ? OR l.model_id ILIKE ?)");
    args.push(`%${query.search}%`, `%${query.search}%`);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    args,
  };
}

export async function listLinkInventory(
  db: PostgresDatabase,
  query: LinkInventoryQuery = {},
): Promise<LinkInventory> {
  const filters = where(query);
  const limit = Math.min(100, Math.max(1, query.limit ?? 50));
  const offset = Math.max(0, query.offset ?? 0);
  const rows = await db
    .prepare(
      `SELECT l.item_id, i.title AS item_title, l.model_id, l.relation,
              l.relation_source, l.reason, l.confidence, l.state, l.revision,
              l.created_at
         FROM content.model_links l
         JOIN content.items i ON i.id = l.item_id
         ${filters.sql}
        ORDER BY l.created_at DESC, l.item_id ASC, l.model_id ASC
        LIMIT ? OFFSET ?`,
    )
    .all<{
      item_id: string;
      item_title: string;
      model_id: string;
      relation: ContentRelation;
      relation_source: "auto" | "operator";
      reason: string;
      confidence: number;
      state: ContentLinkState;
      revision: number;
      created_at: string;
    }>(...filters.args, limit, offset);
  const total = await db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM content.model_links l
         JOIN content.items i ON i.id = l.item_id
         ${filters.sql}`,
    )
    .get<{ total: number | string }>(...filters.args);
  const stateRows = await db
    .prepare(
      `SELECT state, COUNT(*) AS total FROM content.model_links
        GROUP BY state`,
    )
    .all<{ state: ContentLinkState; total: number | string }>();
  const counts = Object.fromEntries(
    CONTENT_LINK_STATES.map((state) => [state, 0]),
  ) as Record<ContentLinkState, number>;

  for (const row of stateRows) counts[row.state] = Number(row.total);

  return {
    links: rows.map((row) => ({
      itemId: row.item_id,
      itemTitle: row.item_title,
      modelId: row.model_id,
      relation: row.relation,
      relationSource: row.relation_source,
      reason: row.reason,
      confidence: row.confidence,
      state: row.state,
      revision: row.revision,
      createdAt: row.created_at,
    })),
    total: Number(total?.total ?? 0),
    counts,
  };
}
