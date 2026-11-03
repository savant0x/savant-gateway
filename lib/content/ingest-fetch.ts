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
import { FETCH_POLICY } from "./url.ts";

export type FetchText = (url: string) => Promise<string>;

export class FetchError extends Error {}

export async function defaultFetchText(url: string): Promise<string> {
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
