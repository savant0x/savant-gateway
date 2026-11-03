/**
 * Trendshift listing (FID-2026-1102-095).
 *
 * Trendshift publishes no feed, so the listing HTML is parsed. The parser
 * anchors on document structure — anchors to `/repositories/{id}` whose text is
 * exactly `owner/repo` — never CSS classes. A redesign degrades to per-item
 * losses, not wrong rows. A listing with zero parseable rows is a hard error so
 * a broken parser cannot look like a healthy empty source.
 */

import type { ParsedItem } from "./types.ts";

import { plainTextBody } from "./feed-xml.ts";
import { CONTENT_LIMITS } from "./policy.ts";

type RowAnchor = { id: string; slug: string; start: number };

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function findRowAnchors(html: string): RowAnchor[] {
  const anchors: RowAnchor[] = [];
  const pattern =
    /<a\b[^>]*href="\/repositories\/(\d+)"[^>]*>((?:(?!<\/a>).)*)<\/a>/g;

  for (const match of Array.from(html.matchAll(pattern))) {
    if (/<svg|<img/i.test(match[2])) continue;

    const slug = decodeHtml(match[2].replace(/<[^>]+>/g, " ")).trim();

    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(slug)) continue;

    anchors.push({ id: match[1], slug, start: match.index ?? 0 });
  }

  const seen = new Set<string>();

  return anchors.filter((anchor) => {
    const key = anchor.slug.toLowerCase();

    if (seen.has(key)) return false;

    seen.add(key);

    return true;
  });
}

function rowWindow(html: string, anchors: RowAnchor[], index: number): string {
  return html.slice(
    anchors[index].start,
    index + 1 < anchors.length ? anchors[index + 1].start : html.length,
  );
}

function scaledNumber(raw: string): number {
  const lower = raw.toLowerCase();
  const multiplier = lower.endsWith("k")
    ? 1_000
    : lower.endsWith("m")
      ? 1_000_000
      : 1;
  const value = Number.parseFloat(lower.replace(/[km]$/, "").replace(/,/g, ""));

  return Number.isFinite(value) ? Math.round(value * multiplier) : Number.NaN;
}

function parseCounts(
  window: string,
  slug: string,
): { views: number; bookmarks: number } {
  const at = window.indexOf(slug);
  const text = decodeHtml(
    window.slice(at === -1 ? 0 : at + slug.length).replace(/<[^>]+>/g, " "),
  );
  const numbers: number[] = [];

  for (const match of Array.from(text.matchAll(/\b([\d.,]+[kKmM]?)\b/g))) {
    const token = match[1];
    const index = match.index ?? 0;
    const context = text.slice(
      Math.max(0, index - 1),
      index + token.length + 1,
    );

    if (/\d-/.test(context) || /-\d/.test(context)) continue;

    const value = scaledNumber(token);

    if (Number.isFinite(value) && value < 100_000_000) numbers.push(value);
    if (numbers.length === 2) break;
  }

  return { views: numbers[0] ?? 0, bookmarks: numbers[1] ?? 0 };
}

function collectTags(window: string): string[] {
  const text = decodeHtml(window.replace(/<[^>]+>/g, " "));
  const tags = new Set<string>();

  for (const match of Array.from(
    text.matchAll(/#([A-Za-z0-9][A-Za-z0-9_-]{0,38})/g),
  )) {
    const tag = match[1].trim();

    if (tag) tags.add(tag);
  }

  return Array.from(tags).slice(0, 8);
}

function findMention(window: string): string | null {
  const reddit = window.match(
    /https?:\/\/(?:www\.)?reddit\.com\/r\/([A-Za-z0-9_]+)/i,
  );

  if (reddit) return `r/${reddit[1]}`;

  const x = window.match(
    /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]+)/i,
  );

  return x ? `@${x[1]}` : null;
}

function findGithubUrl(window: string): string | null {
  const match = window.match(
    /https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i,
  );

  return match
    ? `https://github.com/${match[1]}/${match[2].replace(/\?.*$/, "")}`
    : null;
}

function findDayLabel(window: string): string | null {
  const text = decodeHtml(window.replace(/<[^>]+>/g, " "));

  return text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] ?? null;
}

export function canonicalizeTrendshiftUrl(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (parsed.hostname !== "trendshift.io") return null;
    if (parsed.pathname.startsWith("/api")) return null;

    const sort = parsed.searchParams.get("sort") ?? "views";

    return `https://trendshift.io/?sort=${encodeURIComponent(sort)}`;
  } catch {
    return null;
  }
}

export function parseTrendshiftListing(
  html: string,
  maxItems: number = CONTENT_LIMITS.pageSize,
  now = new Date().toISOString(),
): ParsedItem[] {
  const anchors = findRowAnchors(html);

  if (anchors.length === 0) {
    throw new Error(
      "Trendshift listing parsed to zero entries — the page structure likely changed; the parser needs review (nothing is faked).",
    );
  }

  const items: ParsedItem[] = [];

  for (
    let index = 0;
    index < anchors.length && items.length < maxItems;
    index += 1
  ) {
    const anchor = anchors[index];
    const window = rowWindow(html, anchors, index);
    const counts = parseCounts(window, anchor.slug);
    const tags = collectTags(window);
    const mention = findMention(window) ?? "";
    const github = findGithubUrl(window);
    const slug = anchor.slug.toLowerCase();
    const url =
      github && new URL(github).pathname.toLowerCase() === `/${slug}`
        ? github
        : `https://trendshift.io/repositories/${anchor.id}`;
    const day = findDayLabel(window);
    const published = day ? new Date(`${day}T12:00:00.000Z`) : new Date(now);
    const statLine =
      [
        counts.views > 0 ? `${counts.views.toLocaleString("en")} views` : "",
        counts.bookmarks > 0
          ? `${counts.bookmarks.toLocaleString("en")} bookmarks`
          : "",
      ]
        .filter(Boolean)
        .join(" · ") || "trending now";
    const tagsLine =
      tags.length > 0
        ? ` — ${tags.map((tag) => `#${tag.replace(/\s/g, "")}`).join(" ")}`
        : "";
    const body = `${statLine}${tagsLine}${mention ? ` · mentioned on ${mention}` : ""}`;

    items.push({
      externalId: anchor.slug,
      kind: "repo",
      title: anchor.slug.slice(0, CONTENT_LIMITS.maxTitleChars),
      url,
      excerpt: body.slice(0, CONTENT_LIMITS.maxExcerptChars),
      bodyHtml: plainTextBody(body),
      author: anchor.slug.split("/")[0] ?? anchor.slug,
      publishedAt: Number.isNaN(published.getTime())
        ? new Date(now).toISOString()
        : published.toISOString(),
      thumbnailUrl: null,
      videoId: null,
      tags: [...tags, "repository"],
      metrics: {
        views: counts.views,
        likes: counts.bookmarks,
        comments: 0,
        rating: null,
      },
    });
  }

  return items;
}
