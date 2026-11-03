/**
 * Signal distribution builders (FID-2026-1103-123).
 *
 * RSS, the shields.io badge payload and the requested window are built as pure
 * values so their exact bytes are testable without an HTTP server, a database
 * or a clock. Every builder takes its data as an argument and never reads
 * storage; the routes own the queries.
 */

import type { ContentItem, PublicContentSource } from "./types.ts";

import { publicSourceState } from "./status.ts";

export const DIGEST_FEED_DAYS = { default: 14, min: 1, max: 30 } as const;

export function parseFeedDays(raw: string | null | undefined): number {
  const value = raw?.trim() ?? "";

  if (value === "") return DIGEST_FEED_DAYS.default;

  const days = Number(value);

  if (!Number.isInteger(days)) return DIGEST_FEED_DAYS.default;

  return Math.min(DIGEST_FEED_DAYS.max, Math.max(DIGEST_FEED_DAYS.min, days));
}

/** Escapes text content and attribute values for XML 1.0. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function absolute(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, "")}${path}`;
}

function pubDate(value: string): string | null {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toUTCString();
}

function feedItem(item: ContentItem, origin: string): string {
  const link = absolute(origin, `/signal/${encodeURIComponent(item.id)}`);
  const published = pubDate(item.publishedAt);
  const categories = item.tags
    .map((tag) => `      <category>${escapeXml(tag)}</category>`)
    .join("\n");

  return [
    "    <item>",
    `      <title>${escapeXml(item.title)}</title>`,
    `      <link>${escapeXml(link)}</link>`,
    `      <guid isPermaLink="false">${escapeXml(item.id)}</guid>`,
    published ? `      <pubDate>${published}</pubDate>` : null,
    `      <description>${escapeXml(item.excerpt)}</description>`,
    `      <source>${escapeXml(item.sourceLabel)}</source>`,
    categories || null,
    "    </item>",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function buildDigestFeed({
  items,
  origin,
  days,
  generatedAt = new Date(),
}: {
  items: ContentItem[];
  origin: string;
  days: number;
  generatedAt?: Date;
}): string {
  const self = absolute(
    origin,
    `/signal/digest/feed.xml?days=${parseFeedDays(String(days))}`,
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>Signal — Savant Gateway</title>",
    `    <link>${escapeXml(absolute(origin, "/signal/digest"))}</link>`,
    "    <description>Free AI articles, videos, papers, repositories, and discussions, digest-linked to the models they name.</description>",
    "    <language>en</language>",
    `    <lastBuildDate>${generatedAt.toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml"/>`,
    items.map((item) => feedItem(item, origin)).join("\n"),
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

export type StatusBadge = {
  schemaVersion: 1;
  label: string;
  message: string;
  color: "brightgreen" | "yellow" | "red" | "lightgrey";
};

/**
 * A badge reports Signal source health, never gateway uptime. The projection is
 * the same public one the status page renders, so the badge cannot disclose an
 * upstream error or a paused source's reason.
 */
export function buildStatusBadge(
  sources: PublicContentSource[],
  now = new Date(),
): StatusBadge {
  if (sources.length === 0) {
    return {
      schemaVersion: 1,
      label: "signal",
      message: "no sources",
      color: "lightgrey",
    };
  }

  const counts = { ok: 0, delayed: 0, attention: 0, paused: 0 };

  for (const source of sources) {
    counts[publicSourceState(source, now)] += 1;
  }

  if (counts.attention > 0) {
    return {
      schemaVersion: 1,
      label: "signal",
      message: `${counts.attention} need attention`,
      color: "red",
    };
  }

  if (counts.delayed > 0) {
    return {
      schemaVersion: 1,
      label: "signal",
      message: `${counts.delayed} delayed`,
      color: "yellow",
    };
  }

  if (counts.ok === 0) {
    return {
      schemaVersion: 1,
      label: "signal",
      message: "paused",
      color: "lightgrey",
    };
  }

  return {
    schemaVersion: 1,
    label: "signal",
    message: `${counts.ok}/${sources.length} current`,
    color: "brightgreen",
  };
}
