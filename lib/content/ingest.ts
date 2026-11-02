/**
 * Ingestion orchestration (FID-2026-1102-088).
 *
 * Every effect is injected or bounded: the fetcher can be replaced in a test,
 * the clock is a parameter, the response size is capped, and the item count is
 * clamped by the source row. A failed source records a cycle and increments its
 * failure streak; it never throws into a page render.
 */

import type { PostgresDatabase } from "../storage/pg-adapter.ts";
import type {
  ContentSource,
  GitHubRepo,
  LinkableModel,
  ParsedItem,
} from "./types.ts";

import {
  parseFeed,
  youtubeChannelId,
  youtubeChannelIdFromPage,
  youtubeFeedUrl,
} from "./feeds.ts";
import { plainTextBody } from "./feed-xml.ts";
import { fetchGithubRepo, repoSlugForItem } from "./github.ts";
import { fetchHackerNewsItems } from "./hackernews.ts";
import {
  HUGGINGFACE_DAILY_PAPERS_URL,
  parseDailyPapers,
} from "./huggingface.ts";
import { suggestModelLinks } from "./linking.ts";
import { CONTENT_LIMITS, youtubeApiKey } from "./policy.ts";
import { normalizeTags } from "./taxonomy.ts";
import { parseTrendshiftListing } from "./trendshift.ts";
import {
  listDueSources,
  recordSourceFailure,
  recordSourceSuccess,
} from "./store/sources.ts";
import { listLinkableModels, upsertItem } from "./store/items.ts";
import { replaceAutoLinks } from "./store/links.ts";
import { finishCycle, startCycle } from "./store/cycles.ts";
import { FETCH_POLICY } from "./url.ts";

export type FetchText = (url: string) => Promise<string>;

export type IngestDeps = {
  fetchText?: FetchText;
  now?: () => string;
  models?: LinkableModel[];
  apiKey?: string | null;
  fetchGithub?: (slug: string) => Promise<GitHubRepo | null>;
};

export type IngestResult = {
  sourceId: string;
  sourceLabel: string;
  ok: boolean;
  itemsSeen: number;
  itemsUpserted: number;
  error?: string;
};

class FetchError extends Error {}

async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      "user-agent": "SavantGateway/0.1 content ingestion",
    },
    signal: AbortSignal.timeout(FETCH_POLICY.timeoutMs),
  });

  if (!response.ok) {
    throw new FetchError(`Upstream returned HTTP ${response.status}.`);
  }

  const length = Number(response.headers.get("content-length") ?? "0");

  if (length > FETCH_POLICY.maxBytes) {
    throw new FetchError("Feed exceeds the 2 MiB response ceiling.");
  }

  const text = await response.text();

  if (text.length > FETCH_POLICY.maxBytes) {
    throw new FetchError("Feed exceeds the 2 MiB response ceiling.");
  }

  return text;
}

async function resolveChannelId(
  source: ContentSource,
  fetchText: FetchText,
  apiKey: string | null,
): Promise<string> {
  const raw = source.config.channelId || source.url;
  const channel = youtubeChannelId(raw);

  if (!channel)
    throw new FetchError("A YouTube channel id or URL is required.");
  if (!channel.startsWith("@")) return channel;

  if (!apiKey) {
    const page = await fetchText(`https://www.youtube.com/${channel}`);
    const id = youtubeChannelIdFromPage(page);

    if (!id) {
      throw new FetchError(
        "YouTube did not expose a channel id for that handle; use a UC… channel id or set YOUTUBE_API_KEY.",
      );
    }

    return id;
  }

  const endpoint = new URL("https://www.googleapis.com/youtube/v3/channels");

  endpoint.searchParams.set("part", "id");
  endpoint.searchParams.set("forHandle", channel);
  endpoint.searchParams.set("key", apiKey);

  const body = await fetchText(endpoint.toString());
  const parsed = JSON.parse(body) as {
    items?: Array<{ id?: string }>;
  };
  const id = parsed.items?.[0]?.id;

  if (!id) throw new FetchError("YouTube did not resolve that channel handle.");

  return id;
}

async function sourceFeedUrl(
  source: ContentSource,
  fetchText: FetchText,
  apiKey: string | null,
): Promise<{ url: string; baseUrl: string }> {
  if (source.kind !== "youtube") {
    return { url: source.url, baseUrl: source.url };
  }

  const channelId = await resolveChannelId(source, fetchText, apiKey);
  const url = youtubeFeedUrl(channelId);

  return { url, baseUrl: url };
}

type YouTubeStatistics = {
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
};

function countOf(value: string | undefined): number | null {
  if (!value) return null;

  const number = Number(value);

  return Number.isFinite(number) && number >= 0 ? number : null;
}

/**
 * The channel feed reports views and a star average but never likes or the
 * comment count. The Data API fills those in, one bounded call per 50 items.
 * A failure is absorbed: the feed values stay, the cycle is still a success,
 * because optional engagement must not disable a healthy source.
 */
async function enrichYouTubeMetrics(
  items: ParsedItem[],
  fetchText: FetchText,
  apiKey: string | null,
): Promise<void> {
  if (!apiKey || items.length === 0) return;

  const byVideoId = new Map<string, ParsedItem>();

  for (const item of items) {
    if (item.videoId) byVideoId.set(item.videoId, item);
  }

  const ids = Array.from(byVideoId.keys());

  for (let offset = 0; offset < ids.length; offset += 50) {
    try {
      const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");

      endpoint.searchParams.set("part", "statistics");
      endpoint.searchParams.set("id", ids.slice(offset, offset + 50).join(","));
      endpoint.searchParams.set("key", apiKey);

      const body = await fetchText(endpoint.toString());
      const parsed = JSON.parse(body) as {
        items?: Array<{ id?: string; statistics?: YouTubeStatistics }>;
      };

      for (const row of parsed.items ?? []) {
        const item = row.id ? byVideoId.get(row.id) : undefined;

        if (!item) continue;

        const current = item.metrics ?? {
          views: 0,
          likes: 0,
          youtubeComments: 0,
          rating: null,
        };

        item.metrics = {
          views: countOf(row.statistics?.viewCount) ?? current.views,
          likes: countOf(row.statistics?.likeCount) ?? current.likes,
          youtubeComments:
            countOf(row.statistics?.commentCount) ?? current.youtubeComments,
          rating: current.rating,
        };
      }
    } catch {
      // Optional metadata. Keep the feed-reported values.
    }
  }
}

/**
 * Repo facts are optional. The public API works without a token; a failed or
 * rate-limited lookup leaves the item without GitHub data and never fails the
 * source. The slug may come from the item URL, a `owner/repo` title, or a link
 * in the feed body. Results are cached by slug within one cycle.
 */
async function enrichGithub(
  items: ParsedItem[],
  deps: IngestDeps,
): Promise<void> {
  const fetcher = deps.fetchGithub ?? fetchGithubRepo;
  const cache = new Map<string, GitHubRepo | null>();

  for (const item of items) {
    if (item.kind !== "repo") continue;

    const slug = repoSlugForItem(item);

    if (!slug) continue;

    if (!cache.has(slug)) {
      cache.set(slug, await fetcher(slug).catch(() => null));
    }

    const repo = cache.get(slug) ?? null;

    item.github = repo;

    if (!repo) continue;

    if (repo.description) {
      item.excerpt = repo.description.slice(0, CONTENT_LIMITS.maxExcerptChars);
    }

    if (!item.bodyHtml && repo.description) {
      item.bodyHtml = plainTextBody(repo.description);
    }

    item.thumbnailUrl ??= repo.ogImageUrl;
    item.tags = normalizeTags([...item.tags, ...repo.topics]);
  }
}

async function fetchSourceItems(
  source: ContentSource,
  deps: IngestDeps,
): Promise<ParsedItem[]> {
  const fetchText = deps.fetchText ?? defaultFetchText;

  if (source.kind === "huggingface") {
    const body = await fetchText(HUGGINGFACE_DAILY_PAPERS_URL);
    const items = parseDailyPapers(body, source.maxItems);

    await enrichGithub(items, deps);

    return items;
  }

  if (source.kind === "trendshift") {
    const html = await fetchText(source.url);
    const items = parseTrendshiftListing(html, source.maxItems, deps.now?.());

    await enrichGithub(items, deps);

    return items;
  }

  if (source.kind === "hackernews") {
    return fetchHackerNewsItems(source, { fetchText, now: deps.now?.() });
  }

  const apiKey = deps.apiKey === undefined ? youtubeApiKey() : deps.apiKey;
  const feed = await sourceFeedUrl(source, fetchText, apiKey);
  const xml = await fetchText(feed.url);
  const items = parseFeed(xml, {
    baseUrl: feed.baseUrl,
    sourceKind: source.kind,
    tags: source.config.tags,
    maxItems: source.maxItems,
    now: deps.now?.(),
  });

  if (source.kind === "youtube") {
    await enrichYouTubeMetrics(items, fetchText, apiKey);
  }

  await enrichGithub(items, deps);

  return items;
}

export async function ingestSource(
  db: PostgresDatabase,
  source: ContentSource,
  deps: IngestDeps = {},
): Promise<IngestResult> {
  const now = deps.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const cycleId = await startCycle(db, source.id, startedAt);

  try {
    const items = await fetchSourceItems(source, deps);
    const models = deps.models ?? (await listLinkableModels(db));
    let upserted = 0;

    for (const item of items) {
      const itemId = await upsertItem(db, source, item, now());
      const suggestions = suggestModelLinks(
        { title: item.title, tags: item.tags, kind: item.kind },
        models,
      );

      await replaceAutoLinks(db, itemId, suggestions, now());
      upserted += 1;
    }

    const finishedAt = now();

    await finishCycle(db, cycleId, {
      status: "ok",
      finishedAt,
      itemsSeen: items.length,
      itemsUpserted: upserted,
    });
    await recordSourceSuccess(db, source.id, finishedAt);

    return {
      sourceId: source.id,
      sourceLabel: source.label,
      ok: true,
      itemsSeen: items.length,
      itemsUpserted: upserted,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown ingestion failure.";
    const finishedAt = now();

    await finishCycle(db, cycleId, {
      status: "error",
      finishedAt,
      itemsSeen: 0,
      itemsUpserted: 0,
      error: message,
    });
    await recordSourceFailure(db, source.id, finishedAt, message);

    return {
      sourceId: source.id,
      sourceLabel: source.label,
      ok: false,
      itemsSeen: 0,
      itemsUpserted: 0,
      error: message,
    };
  }
}

export async function ingestDueSources(
  db: PostgresDatabase,
  deps: IngestDeps = {},
  limit = 10,
): Promise<IngestResult[]> {
  const sources = await listDueSources(db, deps.now?.(), limit);
  const results: IngestResult[] = [];

  for (const source of sources) {
    results.push(await ingestSource(db, source, deps));
  }

  return results;
}
