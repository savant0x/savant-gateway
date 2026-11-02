import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type {
  ContentRelation,
  Coverage,
  CoverageItem,
  LinkSuggestion,
} from "../types.ts";

import { parseGithubJson } from "../github.ts";
import { CONTENT_RELATIONS } from "../types.ts";
import { normalizeTags } from "../taxonomy.ts";

type CoverageRow = {
  id: string;
  source_id: string;
  source_label: string;
  kind: CoverageItem["kind"];
  title: string;
  url: string;
  external_url: string | null;
  excerpt: string;
  body_html: string | null;
  author: string | null;
  published_at: string;
  fetched_at: string;
  thumbnail_url: string | null;
  video_id: string | null;
  external_id: string | null;
  view_count: number | string;
  like_count: number | string;
  youtube_comment_count: number | string;
  rating: number | string | null;
  github_json: string | null;
  tags_json: string;
  relation: ContentRelation;
  reason: string;
  confidence: number;
};

function coverageRowToItem(row: CoverageRow): CoverageItem {
  let tags: string[] = [];

  try {
    tags = normalizeTags(JSON.parse(row.tags_json));
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
    externalUrl: row.external_url,
    excerpt: row.excerpt,
    bodyHtml: row.body_html,
    author: row.author,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    thumbnailUrl: row.thumbnail_url,
    videoId: row.video_id,
    externalId: row.external_id,
    tags,
    metrics: {
      views: Number(row.view_count) || 0,
      likes: Number(row.like_count) || 0,
      youtubeComments: Number(row.youtube_comment_count) || 0,
      rating:
        row.rating === null
          ? null
          : Number(row.rating) > 0
            ? Math.min(5, Number(row.rating))
            : null,
    },
    github: parseGithubJson(row.github_json),
    relation: row.relation,
    reason: row.reason,
    confidence: row.confidence,
  };
}

/**
 * Auto links never overwrite an operator decision. The `WHERE` clause on the
 * conflict update is what preserves a manual relation when the same item is
 * fetched again.
 */
export async function replaceAutoLinks(
  db: PostgresDatabase,
  itemId: string,
  suggestions: LinkSuggestion[],
  now = new Date().toISOString(),
): Promise<void> {
  for (const suggestion of suggestions) {
    await db
      .prepare(
        `INSERT INTO content.model_links
          (item_id, model_id, relation, relation_source, confidence, reason,
           reviewed, created_at, updated_at)
         VALUES (?, ?, ?, 'auto', ?, ?, ?, ?, ?)
         ON CONFLICT (item_id, model_id) DO UPDATE SET
           relation = EXCLUDED.relation,
           confidence = EXCLUDED.confidence,
           reason = EXCLUDED.reason,
           reviewed = EXCLUDED.reviewed,
           updated_at = EXCLUDED.updated_at
         WHERE content.model_links.relation_source = 'auto'`,
      )
      .run(
        itemId,
        suggestion.modelId,
        suggestion.relation,
        suggestion.confidence,
        suggestion.reason,
        suggestion.reviewed ? 1 : 0,
        now,
        now,
      );
  }
}

export async function manualLink(
  db: PostgresDatabase,
  itemId: string,
  modelId: string,
  relation: ContentRelation,
  reason = "Operator link",
  now = new Date().toISOString(),
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO content.model_links
        (item_id, model_id, relation, relation_source, confidence, reason,
         reviewed, created_at, updated_at)
       VALUES (?, ?, ?, 'operator', 1, ?, 1, ?, ?)
       ON CONFLICT (item_id, model_id) DO UPDATE SET
         relation = EXCLUDED.relation,
         relation_source = 'operator',
         confidence = 1,
         reason = EXCLUDED.reason,
         reviewed = 1,
         updated_at = EXCLUDED.updated_at`,
    )
    .run(itemId, modelId, relation, reason, now, now);
}

export async function dismissAutoLink(
  db: PostgresDatabase,
  itemId: string,
  modelId: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `DELETE FROM content.model_links
        WHERE item_id = ? AND model_id = ? AND relation_source = 'auto'`,
    )
    .run(itemId, modelId);

  return result.changes > 0;
}

export async function listLinksForItem(
  db: PostgresDatabase,
  itemId: string,
): Promise<LinkSuggestion[]> {
  const rows = await db
    .prepare(
      `SELECT model_id, relation, relation_source, confidence, reason, reviewed
         FROM content.model_links
        WHERE item_id = ?
        ORDER BY confidence DESC, model_id ASC`,
    )
    .all<{
      model_id: string;
      relation: ContentRelation;
      relation_source: "auto" | "operator";
      confidence: number;
      reason: string;
      reviewed: number;
    }>(itemId);

  return rows.map((row) => ({
    modelId: row.model_id,
    relation: row.relation,
    confidence: row.confidence,
    reason: row.reason,
    reviewed: row.reviewed === 1,
  }));
}

export async function listContentForModel(
  db: PostgresDatabase,
  modelId: string,
  limit = 24,
): Promise<Coverage> {
  const rows = await db
    .prepare(
      `SELECT i.id, i.source_id, s.label AS source_label, i.kind, i.title,
              i.url, i.external_url, i.excerpt, i.body_html, i.author,
              i.published_at,
              i.fetched_at, i.thumbnail_url, i.video_id, i.external_id,
              i.view_count, i.like_count, i.youtube_comment_count, i.rating,
              i.github_json,
              COALESCE(
                (SELECT json_agg(t.tag ORDER BY t.tag)
                   FROM content.item_tags t WHERE t.item_id = i.id),
                '[]'::json
              )::text AS tags_json,
              l.relation, l.reason, l.confidence
         FROM content.model_links l
         JOIN content.items i ON i.id = l.item_id
         JOIN content.sources s ON s.id = i.source_id
        WHERE l.model_id = ? AND l.reviewed = 1
        ORDER BY i.published_at DESC
        LIMIT ?`,
    )
    .all<CoverageRow>(modelId, Math.min(50, Math.max(1, limit)));

  const counts = Object.fromEntries(
    CONTENT_RELATIONS.map((relation) => [relation, 0]),
  ) as Record<ContentRelation, number>;

  for (const row of rows) counts[row.relation] += 1;

  const totalRow = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM content.model_links
        WHERE model_id = ? AND reviewed = 1`,
    )
    .get<{ total: number | string }>(modelId);

  return {
    modelId,
    total: Number(totalRow?.total ?? rows.length),
    counts,
    items: rows.map(coverageRowToItem),
  };
}

export type AdminLinkRow = {
  itemId: string;
  itemTitle: string;
  modelId: string;
  relation: ContentRelation;
  relationSource: "auto" | "operator";
  reason: string;
  confidence: number;
  reviewed: boolean;
  createdAt: string;
};

export async function listRecentLinks(
  db: PostgresDatabase,
  limit = 30,
): Promise<AdminLinkRow[]> {
  const rows = await db
    .prepare(
      `SELECT l.item_id, i.title AS item_title, l.model_id, l.relation,
              l.relation_source, l.reason, l.confidence, l.reviewed,
              l.created_at
         FROM content.model_links l
         JOIN content.items i ON i.id = l.item_id
        ORDER BY l.created_at DESC
        LIMIT ?`,
    )
    .all<{
      item_id: string;
      item_title: string;
      model_id: string;
      relation: ContentRelation;
      relation_source: "auto" | "operator";
      reason: string;
      confidence: number;
      reviewed: number;
      created_at: string;
    }>(Math.min(100, Math.max(1, limit)));

  return rows.map((row) => ({
    itemId: row.item_id,
    itemTitle: row.item_title,
    modelId: row.model_id,
    relation: row.relation,
    relationSource: row.relation_source,
    reason: row.reason,
    confidence: row.confidence,
    reviewed: row.reviewed === 1,
    createdAt: row.created_at,
  }));
}

export async function linkedItemCount(db: PostgresDatabase): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT item_id) AS total FROM content.model_links
        WHERE reviewed = 1`,
    )
    .get<{ total: number | string }>();

  return Number(row?.total ?? 0);
}
