/**
 * Feed fetching and YouTube resolution for ingestion.
 *
 * Kept apart from the ingestion orchestration so the transport bound, the
 * handle resolution and the optional statistics enrichment can be read without
 * the cycle bookkeeping around them.
 */

import type { ContentSource, ParsedItem } from "./types.ts";

import {
  youtubeChannelId,
  youtubeChannelIdFromPage,
  youtubeFeedUrl,
} from "./feeds.ts";
import { SourceConfigError } from "./source-error.ts";
import { FETCH_POLICY } from "./url.ts";

export type FetchText = (url: string) => Promise<string>;

export class FetchError extends Error {}

export type FeedCacheEntry = {
  body: string;
  etag: string | null;
  lastModified: string | null;
};

/**
 * Conditional feed GET with a bounded in-process body cache (FID-1103-120).
 *
 * The cache is a bandwidth optimization, never a source of truth: an empty
 * cache sends no validators, and a 304 without a cached body is an error rather
 * than an empty feed. Keys are the canonical feed URL, so editing a source to a
 * new URL starts a new entry.
 */
export function createConditionalFeedFetcher(
  fetchImpl: typeof fetch = fetch,
  cache: Map<string, FeedCacheEntry> = new Map(),
  maxEntries = 64,
): FetchText {
  return async (url) => {
    const cached = cache.get(url);
    const headers: Record<string, string> = {
      accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      "user-agent": "SavantGateway/0.1 content ingestion",
    };

    if (cached?.etag) headers["if-none-match"] = cached.etag;
    if (cached?.lastModified)
      headers["if-modified-since"] = cached.lastModified;

    const response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(FETCH_POLICY.timeoutMs),
    });

    if (response.status === 304) {
      if (!cached) {
        throw new FetchError("Upstream returned 304 without a cached feed.");
      }

      // Refresh recency without changing the stored body.
      cache.delete(url);
      cache.set(url, cached);

      return cached.body;
    }

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

    if (maxEntries > 0) {
      cache.delete(url);
      cache.set(url, {
        body: text,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      });

      while (cache.size > maxEntries) {
        const oldest = cache.keys().next().value;

        if (oldest === undefined) break;

        cache.delete(oldest);
      }
    }

    return text;
  };
}

export const defaultFetchText = createConditionalFeedFetcher();

async function resolveChannelId(
  source: ContentSource,
  fetchText: FetchText,
  apiKey: string | null,
): Promise<string> {
  const raw = source.config.channelId || source.url;
  const channel = youtubeChannelId(raw);

  if (!channel)
    throw new SourceConfigError("A YouTube channel id or URL is required.");
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

export async function sourceFeedUrl(
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
export async function enrichYouTubeMetrics(
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
          comments: 0,
          rating: null,
        };

        item.metrics = {
          views: countOf(row.statistics?.viewCount) ?? current.views,
          likes: countOf(row.statistics?.likeCount) ?? current.likes,
          comments: countOf(row.statistics?.commentCount) ?? current.comments,
          rating: current.rating,
        };
      }
    } catch {
      // Optional metadata. Keep the feed-reported values.
    }
  }
}
