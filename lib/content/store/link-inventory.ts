import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type {
  ContentKind,
  ContentLinkState,
  ContentRelation,
} from "../types.ts";

import { decodeCursor, encodeCursor } from "../pagination.ts";
import { CONTENT_LINK_STATES } from "../visibility.ts";

export type LinkInventoryQuery = {
  state?: ContentLinkState;
  modelId?: string;
  sourceId?: string;
  kind?: ContentKind;
  relation?: ContentRelation;
  search?: string;
  since?: string;
  until?: string;
  cursor?: string | null;
  limit?: number;
};

export type LinkInventoryRow = {
  itemId: string;
  itemTitle: string;
  sourceId: string;
  sourceLabel: string;
  kind: ContentKind;
  publishedAt: string;
  modelId: string;
  relation: ContentRelation;
  relationSource: "auto" | "operator";
  reason: string;
  confidence: number;
  state: ContentLinkState;
  revision: number;
  decisionAt: string | null;
  createdAt: string;
};

export type LinkInventory = {
  links: LinkInventoryRow[];
  total: number;
  counts: Record<ContentLinkState, number>;
  nextCursor: string | null;
};

type Filter = { sql: string; args: unknown[] };

function filter(query: LinkInventoryQuery, includeState: boolean): Filter {
  const clauses: string[] = [];
  const args: unknown[] = [];

  if (includeState && query.state) {
    clauses.push("l.state = ?");
    args.push(query.state);
  }

  if (query.modelId) {
    clauses.push("l.model_id = ?");
    args.push(query.modelId);
  }

  if (query.sourceId) {
    clauses.push("i.source_id = ?");
    args.push(query.sourceId);
  }

  if (query.kind) {
    clauses.push("i.kind = ?");
    args.push(query.kind);
  }

  if (query.relation) {
    clauses.push("l.relation = ?");
    args.push(query.relation);
  }

  if (query.search) {
    clauses.push("(i.title ILIKE ? OR l.model_id ILIKE ?)");
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

  const cursor = decodeCursor(query.cursor, 3);

  if (cursor) {
    clauses.push(
      `(l.created_at < ? OR
        (l.created_at = ? AND
         (l.item_id > ? OR (l.item_id = ? AND l.model_id > ?))))`,
    );
    args.push(cursor[0], cursor[0], cursor[1], cursor[1], cursor[2]);
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
  const limit = Math.min(100, Math.max(1, query.limit ?? 50));
  const page = filter(query, true);
  const scope = filter({ ...query, cursor: null }, false);
  const rows = await db
    .prepare(
      `SELECT l.item_id, i.title AS item_title, i.source_id,
              s.label AS source_label, i.kind, i.published_at,
              l.model_id, l.relation, l.relation_source, l.reason,
              l.confidence, l.state, l.revision, l.decision_at,
              l.created_at
         FROM content.model_links l
         JOIN content.items i ON i.id = l.item_id
         JOIN content.sources s ON s.id = i.source_id
         ${page.sql}
        ORDER BY l.created_at DESC, l.item_id ASC, l.model_id ASC
        LIMIT ?`,
    )
    .all<{
      item_id: string;
      item_title: string;
      source_id: string;
      source_label: string;
      kind: ContentKind;
      published_at: string;
      model_id: string;
      relation: ContentRelation;
      relation_source: "auto" | "operator";
      reason: string;
      confidence: number;
      state: ContentLinkState;
      revision: number;
      decision_at: string | null;
      created_at: string;
    }>(...page.args, limit);
  const total = await db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM content.model_links l
         JOIN content.items i ON i.id = l.item_id
         ${filter({ ...query, cursor: null }, true).sql}`,
    )
    .get<{ total: number | string }>(
      ...filter({ ...query, cursor: null }, true).args,
    );
  const stateRows = await db
    .prepare(
      `SELECT l.state, COUNT(*) AS total
         FROM content.model_links l
         JOIN content.items i ON i.id = l.item_id
         ${scope.sql}
        GROUP BY l.state`,
    )
    .all<{ state: ContentLinkState; total: number | string }>(...scope.args);
  const counts = Object.fromEntries(
    CONTENT_LINK_STATES.map((state) => [state, 0]),
  ) as Record<ContentLinkState, number>;

  for (const row of stateRows) counts[row.state] = Number(row.total);

  const last = rows.at(-1);

  return {
    links: rows.map((row) => ({
      itemId: row.item_id,
      itemTitle: row.item_title,
      sourceId: row.source_id,
      sourceLabel: row.source_label,
      kind: row.kind,
      publishedAt: row.published_at,
      modelId: row.model_id,
      relation: row.relation,
      relationSource: row.relation_source,
      reason: row.reason,
      confidence: row.confidence,
      state: row.state,
      revision: row.revision,
      decisionAt: row.decision_at,
      createdAt: row.created_at,
    })),
    total: Number(total?.total ?? 0),
    counts,
    nextCursor:
      rows.length === limit && last
        ? encodeCursor([last.created_at, last.item_id, last.model_id])
        : null,
  };
}
