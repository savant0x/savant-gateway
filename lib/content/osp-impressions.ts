/**
 * Open Source Projects impressions (FID-2026-1103-121).
 *
 * The listing API is disallowed by the site's robots policy and is never
 * fetched. Individual post pages are allowed and server-rendered, and they
 * carry a per-project "Impressions" count. Enrichment is optional: a missing
 * marker or a failed page leaves the item without a views metric instead of
 * inventing a zero.
 */

import type { ParsedItem } from "./types.ts";

const OSP_HOSTS = new Set([
  "www.opensourceprojects.dev",
  "opensourceprojects.dev",
]);
const MAX_PAGES = 24;
const CONCURRENCY = 4;

/** Only a public post page on the OSP host is ever fetched. */
export function isOspPostUrl(raw: string): boolean {
  try {
    const url = new URL(raw);

    return (
      OSP_HOSTS.has(url.hostname.toLowerCase()) &&
      url.pathname.startsWith("/post/")
    );
  } catch {
    return false;
  }
}

/** Reads `Impressions 41` / `Impressions 1,204` from the visible page text. */
export function parseOspImpressions(html: string): number | null {
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const match = text.match(/Impressions\s*([\d,]+)/i);

  if (!match) return null;

  const value = Number.parseInt(match[1].replace(/,/g, ""), 10);

  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * Fetches at most `maxPages` post pages, four at a time. Returns how many items
 * received a views count. Every page failure is isolated and never fails the
 * source.
 */
export async function enrichOspImpressions(
  items: ParsedItem[],
  fetchText: (url: string) => Promise<string>,
  maxPages = MAX_PAGES,
): Promise<number> {
  const targets = items
    .filter((item) => isOspPostUrl(item.url))
    .slice(0, Math.max(0, Math.trunc(maxPages)));

  if (targets.length === 0) return 0;

  let cursor = 0;
  let applied = 0;

  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const item = targets[cursor];

      cursor += 1;

      try {
        const views = parseOspImpressions(await fetchText(item.url));

        if (views === null) continue;

        item.metrics = {
          views,
          likes: item.metrics?.likes ?? 0,
          comments: item.metrics?.comments ?? 0,
          rating: item.metrics?.rating ?? null,
        };
        applied += 1;
      } catch {
        // Optional enrichment; keep the item without a views count.
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker),
  );

  return applied;
}
