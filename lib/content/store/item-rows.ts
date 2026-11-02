import type { ContentItem, ContentKind, GitHubRepo } from "../types.ts";

import { isMetadataTemplate } from "../article-sanitize.ts";
import { parseGithubJson } from "../github.ts";
import { normalizeTags } from "../taxonomy.ts";

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
  view_count: number | string;
  like_count: number | string;
  youtube_comment_count: number | string;
  rating: number | string | null;
  github_json: string | null;
  tags_json: string;
};

function toCount(value: number | string | null): number {
  const number = Number(value ?? 0);

  return Number.isFinite(number) && number > 0 ? number : 0;
}

function toRating(value: number | string | null): number | null {
  if (value === null) return null;

  const rating = Number(value);

  return Number.isFinite(rating) && rating > 0 ? Math.min(5, rating) : null;
}

export function toItem(row: ItemRow): ContentItem {
  let tags: string[] = [];

  try {
    const parsed = JSON.parse(row.tags_json) as unknown;

    tags = normalizeTags(parsed);
  } catch {
    tags = [];
  }

  const excerpt = isMetadataTemplate(row.excerpt) ? row.title : row.excerpt;

  return {
    id: row.id,
    sourceId: row.source_id,
    sourceLabel: row.source_label,
    kind: row.kind,
    title: row.title,
    url: row.url,
    excerpt,
    bodyHtml: row.body_html,
    author: row.author,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    thumbnailUrl: row.thumbnail_url,
    videoId: row.video_id,
    externalId: row.external_id,
    tags,
    metrics: {
      views: toCount(row.view_count),
      likes: toCount(row.like_count),
      youtubeComments: toCount(row.youtube_comment_count),
      rating: toRating(row.rating),
    },
    github: parseGithubJson(row.github_json),
  };
}

export function githubJson(repo: GitHubRepo | null | undefined): string | null {
  if (!repo) return null;

  return JSON.stringify({
    slug: repo.slug,
    description: repo.description,
    stars: repo.stars,
    forks: repo.forks,
    language: repo.language,
    topics: repo.topics.slice(0, 12),
    license: repo.license,
    homepage: repo.homepage,
    pushedAt: repo.pushedAt,
    ogImageUrl: repo.ogImageUrl,
    readmeHtml: repo.readmeHtml,
  });
}

export const ITEM_COLUMNS = `
  i.id, i.source_id, s.label AS source_label, i.kind, i.title, i.url,
  i.excerpt, i.body_html, i.author, i.published_at, i.fetched_at,
  i.thumbnail_url, i.video_id, i.external_id,
  i.view_count, i.like_count, i.youtube_comment_count, i.rating, i.github_json,
  COALESCE(
    (SELECT json_agg(t.tag ORDER BY t.tag)
       FROM content.item_tags t WHERE t.item_id = i.id),
    '[]'::json
  )::text AS tags_json
`;
