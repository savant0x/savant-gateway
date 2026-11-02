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

import { XMLParser } from "fast-xml-parser";
import sanitizeHtml from "sanitize-html";

import { CONTENT_LIMITS } from "./policy.ts";
import { normalizeTags } from "./taxonomy.ts";
import { resolveFeedUrl } from "./url.ts";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "a",
  "img",
  "h2",
  "h3",
  "h4",
  "figure",
  "figcaption",
  "hr",
];

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt", "loading"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: "noreferrer noopener" },
    }),
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: "lazy" },
    }),
  },
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: "__cdata",
  trimValues: true,
  parseTagValue: false,
});

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];

  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);

  if (Array.isArray(value)) {
    return value
      .map((entry) => textOf(entry))
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.__cdata === "string") return record.__cdata.trim();
    if (typeof record["#text"] === "string") return record["#text"].trim();

    return "";
  }

  return "";
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = textOf(value);

    if (text) return text;
  }

  return "";
}

function attr(value: unknown, name: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";

  const found = (value as Record<string, unknown>)[`@_${name}`];

  return typeof found === "string" ? found.trim() : "";
}

function entryLink(entry: Record<string, unknown>): string {
  for (const candidate of asArray(entry.link)) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (!candidate || typeof candidate !== "object") continue;

    const record = candidate as Record<string, unknown>;
    const rel = attr(record, "rel");

    if (!rel || rel === "alternate") {
      const href = attr(record, "href");

      if (href) return href;
    }
  }

  return firstText(entry.id, entry.guid);
}

function mediaUrl(entry: Record<string, unknown>): string | null {
  for (const key of ["media:thumbnail", "media:content", "enclosure"]) {
    for (const candidate of asArray(entry[key])) {
      const url = attr(candidate, "url");

      if (url) return url;
    }
  }

  return null;
}

function entryTags(entry: Record<string, unknown>, extra: string[]): string[] {
  const categories: unknown[] = [];

  for (const key of ["category", "media:keywords"]) {
    for (const candidate of asArray(entry[key])) {
      if (typeof candidate === "string") {
        categories.push(candidate);
      } else if (candidate && typeof candidate === "object") {
        const record = candidate as Record<string, unknown>;

        categories.push(attr(record, "term"), textOf(record));
      }
    }
  }

  return normalizeTags([...extra, ...categories]);
}

function stripHtml(value: string): string {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBody(value: string): string | null {
  const clean = sanitizeHtml(value, SANITIZE_OPTIONS).trim();

  if (!clean) return null;

  return clean.slice(0, CONTENT_LIMITS.maxBodyChars);
}

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

function publishedAt(value: unknown, fallback: string): string {
  const text = textOf(value);

  if (!text) return fallback;

  const date = new Date(text);

  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
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

function entryFromYouTube(
  entry: Record<string, unknown>,
  options: ParseOptions,
  now: string,
): ParsedItem | null {
  const title = firstText(entry.title).slice(0, CONTENT_LIMITS.maxTitleChars);
  const videoId = firstText(entry["yt:videoId"]);
  const rawLink =
    entryLink(entry) ||
    (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "");
  const url = rawLink ? resolveFeedUrl(rawLink, options.baseUrl) : null;

  if (!title || !url) return null;

  const rawBody = firstText(entry.content, entry.summary);
  const excerpt = stripHtml(rawBody).slice(0, CONTENT_LIMITS.maxExcerptChars);
  const thumbnail = mediaUrl(entry);
  const author =
    firstText(entry.author).slice(0, CONTENT_LIMITS.maxAuthorChars) || null;

  return {
    externalId: videoId || firstText(entry.id) || null,
    kind: "video",
    title,
    url,
    excerpt,
    bodyHtml: cleanBody(rawBody),
    author,
    publishedAt: publishedAt(firstText(entry.published, entry.updated), now),
    thumbnailUrl: thumbnail
      ? resolveFeedUrl(thumbnail, options.baseUrl)
      : videoId
        ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`
        : null,
    videoId: videoId || null,
    tags: entryTags(entry, options.tags),
  };
}

export type ParseOptions = {
  baseUrl: string;
  sourceKind: "rss" | "youtube";
  tags: string[];
  maxItems?: number;
  now?: string;
};

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
