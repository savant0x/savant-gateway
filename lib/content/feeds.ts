/**
 * Feed parsing (FID-2026-1102-088).
 *
 * The reference site parsed RSS and YouTube in two unrelated fetchers. This
 * module normalizes both into `ParsedItem`, so the rest of the application
 * never learns whether a story arrived as an RSS item or a YouTube entry.
 *
 * Two safety properties are enforced here rather than at render time:
 * HTML is sanitized with an allowlist, and every link is resolved and checked
 * by the URL policy before it is stored.
 */

import type { ContentKind, ParsedItem } from "./types.ts";
import type { ParseOptions } from "./feed-xml.ts";

import { XMLParser } from "fast-xml-parser";

import { CONTENT_LIMITS } from "./policy.ts";
import { resolveFeedUrl } from "./url.ts";
import { entryFromYouTube } from "./feed-youtube.ts";
import {
  asArray,
  cleanBody,
  entryLink,
  entryTags,
  firstText,
  mediaUrl,
  publishedAt,
  stripHtml,
} from "./feed-xml.ts";

export type { ParseOptions } from "./feed-xml.ts";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: "__cdata",
  trimValues: true,
  parseTagValue: false,
});

function inferKind(
  sourceKind: "rss" | "youtube",
  host: string,
  title: string,
  tags: string[],
): ContentKind {
  if (sourceKind === "youtube") return "video";

  const haystack = `${host} ${title} ${tags.join(" ")}`.toLowerCase();

  if (/arxiv|paper|doi|research/.test(haystack)) return "paper";
  if (/github|repository|repo\b/.test(haystack)) return "repo";
  if (/reddit|hacker news|forum|discussion/.test(haystack)) {
    return "discussion";
  }

  return "article";
}

function entryFromRss(
  entry: Record<string, unknown>,
  options: ParseOptions,
  now: string,
): ParsedItem | null {
  const title = firstText(entry.title).slice(0, CONTENT_LIMITS.maxTitleChars);
  const rawLink = entryLink(entry);
  const url = rawLink ? resolveFeedUrl(rawLink, options.baseUrl) : null;

  if (!title || !url) return null;

  const rawBody = firstText(
    entry["content:encoded"],
    entry.content,
    entry.description,
    entry.summary,
  );
  const excerptSource = firstText(
    entry.description,
    entry.summary,
    entry["content:encoded"],
    entry.content,
  );
  const excerpt = stripHtml(excerptSource).slice(
    0,
    CONTENT_LIMITS.maxExcerptChars,
  );
  const tags = entryTags(entry, options.tags);
  const host = new URL(options.baseUrl).hostname;
  const author =
    firstText(entry["dc:creator"], entry.author, entry["itunes:author"]).slice(
      0,
      CONTENT_LIMITS.maxAuthorChars,
    ) || null;
  const thumbnail = mediaUrl(entry);

  return {
    externalId: firstText(entry.guid, entry.id) || null,
    kind: inferKind(options.sourceKind, host, title, tags),
    title,
    url,
    excerpt,
    bodyHtml: cleanBody(rawBody),
    author,
    publishedAt: publishedAt(
      firstText(
        entry.pubDate,
        entry.published,
        entry.updated,
        entry["dc:date"],
      ),
      now,
    ),
    thumbnailUrl: thumbnail ? resolveFeedUrl(thumbnail, options.baseUrl) : null,
    videoId: null,
    tags,
  };
}

/**
 * Parses an RSS 2.0, Atom, or YouTube Atom document. Malformed XML returns an
 * empty list rather than throwing into the ingestion caller; the caller records
 * the empty cycle and the source health.
 */
export function parseFeed(xml: string, options: ParseOptions): ParsedItem[] {
  if (!xml.trim()) return [];

  let document: Record<string, unknown>;

  try {
    document = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }

  const now = options.now ?? new Date().toISOString();
  const limit = Math.min(options.maxItems ?? 20, CONTENT_LIMITS.pageSize * 2);
  const rss = document.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const feed = document.feed as Record<string, unknown> | undefined;

  const rssEntries = asArray(channel?.item) as Record<string, unknown>[];
  const atomEntries = asArray(feed?.entry) as Record<string, unknown>[];
  const entries = rssEntries.length > 0 ? rssEntries : atomEntries;
  const isYouTube =
    options.sourceKind === "youtube" || Boolean(feed?.["yt:channelId"]);

  const items: ParsedItem[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;

    const item = isYouTube
      ? entryFromYouTube(entry, options, now)
      : entryFromRss(entry, options, now);

    if (item) items.push(item);
    if (items.length >= limit) break;
  }

  return items;
}

/** Extracts a YouTube channel id from an id or channel URL. */
export function youtubeChannelId(raw: string): string | null {
  const value = raw.trim();

  if (/^UC[A-Za-z0-9_-]{20,}$/.test(value)) return value;

  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/channel\/(UC[A-Za-z0-9_-]{20,})/);

    if (match) return match[1];

    const handle = url.pathname.match(/\/@([A-Za-z0-9._-]+)/);

    return handle ? `@${handle[1]}` : null;
  } catch {
    return value.startsWith("@") ? value : null;
  }
}

export function youtubeFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(
    channelId,
  )}`;
}
