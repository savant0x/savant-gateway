/**
 * Hacker News adapter (FID-2026-1102-110).
 *
 * The v0 API is an id-list plus per-item JSON API, not RSS. This module validates
 * that shape, reads a bounded candidate window with bounded concurrency, and
 * applies a deterministic topic filter. It never calls a model, follows an
 * arbitrary URL, or treats the HN thread as the publisher article.
 */

import type { ContentSource, ParsedItem } from "./types.ts";

import { cleanBody, stripHtml } from "./feed-xml.ts";
import {
  HACKERNEWS_FILTER_LIMITS,
  hackerNewsFilterTerms,
  hackerNewsStreamFromUrl,
} from "./hackernews-config.ts";
import { CONTENT_LIMITS } from "./policy.ts";
import { SourceConfigError } from "./source-error.ts";
import { normalizeTags } from "./taxonomy.ts";
import { validatePublicHttpUrl } from "./url.ts";

export type HackerNewsStory = {
  id: number;
  title: string;
  externalUrl: string | null;
  author: string | null;
  publishedAt: string;
  bodyHtml: string | null;
  plainBody: string;
  excerpt: string;
  /** HN points, when the item reports a usable integer. */
  score: number | null;
  /** HN comment count, when the item reports a usable integer. */
  comments: number | null;
};

export type HackerNewsMatch = {
  accepted: boolean;
  matchedTerms: string[];
};

type DetailResult = {
  ok: boolean;
  story: HackerNewsStory | null;
};

const TERM_ESCAPE = /[.*+?^${}()|[\]\\]/g;

function discussionUrl(id: number): string {
  return `https://news.ycombinator.com/item?id=${id}`;
}

export function hackerNewsItemUrl(id: number): string {
  return `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
}

export function isHackerNewsDiscussionUrl(raw: string): boolean {
  try {
    const url = new URL(raw);

    return (
      url.hostname === "news.ycombinator.com" &&
      url.pathname === "/item" &&
      /^\d+$/.test(url.searchParams.get("id") ?? "")
    );
  } catch {
    return false;
  }
}

/** Root list validation. An empty array is a healthy empty stream. */
export function parseHackerNewsList(text: string): number[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Hacker News returned invalid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Hacker News returned an unexpected list shape.");
  }

  const seen = new Set<number>();

  for (const value of parsed) {
    const id = typeof value === "number" ? value : Number(value);

    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;

    seen.add(id);
  }

  return Array.from(seen);
}

function positiveTime(value: unknown): number | null {
  const time = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(time) || time <= 0) return null;

  const year = new Date(time * 1000).getUTCFullYear();

  return year >= 2000 && year <= 2100 ? time : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);

  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function readableExternalUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;

  const policy = validatePublicHttpUrl(raw);

  if (!policy.ok || isHackerNewsDiscussionUrl(policy.url.toString())) {
    return null;
  }

  return policy.url.toString();
}

/**
 * A single item is untrusted input. Comments, polls, jobs, dead/deleted rows,
 * malformed ids, and missing titles are skipped rather than imported as stories.
 */
export function parseHackerNewsStory(
  text: string,
  now = new Date().toISOString(),
): HackerNewsStory | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const item = parsed as Record<string, unknown>;
  const id = typeof item.id === "number" ? item.id : Number(item.id);

  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (item.type !== "story") return null;
  if (item.dead === true || item.deleted === true) return null;

  const title = stripHtml(typeof item.title === "string" ? item.title : "");
  const time = positiveTime(item.time);

  if (!title || time === null) return null;

  const rawText = typeof item.text === "string" ? item.text : "";
  const plainBody = stripHtml(rawText);
  const bodyHtml = cleanBody(rawText);
  const publishedAt = new Date(time * 1000).toISOString();
  const excerpt =
    plainBody.slice(0, CONTENT_LIMITS.maxExcerptChars) ||
    title.slice(0, CONTENT_LIMITS.maxExcerptChars);
  const author =
    typeof item.by === "string" && item.by.trim()
      ? item.by.trim().slice(0, CONTENT_LIMITS.maxAuthorChars)
      : null;

  return {
    id,
    title: title.slice(0, CONTENT_LIMITS.maxTitleChars),
    externalUrl: readableExternalUrl(item.url),
    author,
    publishedAt: publishedAt || now,
    bodyHtml,
    plainBody,
    excerpt,
    score: nonNegativeInteger(item.score),
    comments: nonNegativeInteger(item.descendants),
  };
}

function termPattern(term: string): RegExp {
  const escaped = term.replace(TERM_ESCAPE, "\\$&");

  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
}

function matches(text: string, term: string): boolean {
  return termPattern(term).test(text);
}

/**
 * A title hit is worth 3; a body or URL hit is worth 1. A title match therefore
 * qualifies alone, while a body-only mention needs a second independent field or
 * term. Exclusions veto every inclusion.
 */
export function matchHackerNewsStory(
  story: HackerNewsStory,
  config: { includeTerms?: unknown; excludeTerms?: unknown },
): HackerNewsMatch {
  const terms = hackerNewsFilterTerms(config);
  const title = story.title.toLowerCase();
  const body = story.plainBody.toLowerCase();
  const external = (story.externalUrl ?? "").toLowerCase();

  for (const term of terms.exclude) {
    if (
      matches(title, term) ||
      matches(body, term) ||
      matches(external, term)
    ) {
      return { accepted: false, matchedTerms: [] };
    }
  }

  const matchedTerms: string[] = [];
  let score = 0;

  for (const term of terms.include) {
    const inTitle = matches(title, term);
    const inBody = matches(body, term);
    const inUrl = matches(external, term);

    if (!inTitle && !inBody && !inUrl) continue;

    matchedTerms.push(term);
    if (inTitle) score += 3;
    if (inBody) score += 1;
    if (inUrl) score += 1;
  }

  return {
    accepted: score >= 2,
    matchedTerms: matchedTerms.slice(0, 8),
  };
}

function parsedItem(
  story: HackerNewsStory,
  source: ContentSource,
  matchedTerms: string[],
): ParsedItem {
  return {
    externalId: String(story.id),
    kind: "discussion",
    title: story.title,
    url: discussionUrl(story.id),
    externalUrl: story.externalUrl,
    excerpt: story.excerpt,
    bodyHtml: story.bodyHtml,
    author: story.author,
    publishedAt: story.publishedAt,
    thumbnailUrl: null,
    videoId: null,
    tags: normalizeTags(["hackernews", ...source.config.tags, ...matchedTerms]),
    ...(story.score !== null || story.comments !== null
      ? {
          metrics: {
            views: 0,
            likes: story.score ?? 0,
            comments: story.comments ?? 0,
            rating: null,
          },
        }
      : {}),
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  work: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;

      cursor += 1;
      results[index] = await work(values[index]);
    }
  };

  const workers = Array.from({ length: Math.min(limit, values.length) }, () =>
    worker(),
  );

  await Promise.all(workers);

  return results;
}

export type HackerNewsFetchDeps = {
  fetchText: (url: string) => Promise<string>;
  now?: string;
};

/**
 * Reads the selected ranked list, then a bounded candidate window. A missing
 * individual item is skipped; if every detail read fails, the source cycle fails
 * instead of reporting a false empty success.
 */
export async function fetchHackerNewsItems(
  source: ContentSource,
  deps: HackerNewsFetchDeps,
): Promise<ParsedItem[]> {
  if (!hackerNewsStreamFromUrl(source.url)) {
    throw new SourceConfigError(
      "Hacker News sources must use a known v0 ranked-list URL.",
    );
  }

  const ids = parseHackerNewsList(await deps.fetchText(source.url));

  if (ids.length === 0) return [];

  const candidateLimit = Math.min(
    HACKERNEWS_FILTER_LIMITS.candidateLimit,
    Math.max(HACKERNEWS_FILTER_LIMITS.minimumCandidates, source.maxItems * 4),
  );
  const candidates = ids.slice(0, candidateLimit);
  const now = deps.now ?? new Date().toISOString();
  const details = await mapWithConcurrency(
    candidates,
    HACKERNEWS_FILTER_LIMITS.detailConcurrency,
    async (id): Promise<DetailResult> => {
      try {
        return {
          ok: true,
          story: parseHackerNewsStory(
            await deps.fetchText(hackerNewsItemUrl(id)),
            now,
          ),
        };
      } catch {
        return { ok: false, story: null };
      }
    },
  );

  if (details.length > 0 && details.every((entry) => !entry.ok)) {
    throw new Error("Hacker News item reads failed for every candidate.");
  }

  const items: ParsedItem[] = [];

  for (const entry of details) {
    if (!entry.story) continue;

    const match = matchHackerNewsStory(entry.story, source.config);

    if (!match.accepted) continue;

    items.push(parsedItem(entry.story, source, match.matchedTerms));

    if (items.length >= source.maxItems) break;
  }

  return items;
}
