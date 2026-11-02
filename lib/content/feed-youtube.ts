/**
 * YouTube Atom entry parsing (FID-2026-1102-088, extended 092).
 *
 * The channel feed nests the description, thumbnail, views, and star rating in
 * `media:group`. Reading only the entry root loses all of it, which is what the
 * first release did. This module reads both levels and falls back to the
 * predictable `i.ytimg.com` thumbnail when the feed omits one.
 */

import type { ParsedItem } from "./types.ts";
import type { ParseOptions } from "./feed-xml.ts";

import { CONTENT_LIMITS } from "./policy.ts";
import { resolveFeedUrl } from "./url.ts";
import {
  entryLink,
  entryTags,
  firstObject,
  firstText,
  mediaUrl,
  numberAttr,
  plainTextBody,
  publishedAt,
  stripHtml,
} from "./feed-xml.ts";

export function entryFromYouTube(
  entry: Record<string, unknown>,
  options: ParseOptions,
  now: string,
): ParsedItem | null {
  const group = firstObject(entry["media:group"]);
  const title = firstText(entry.title, group?.["media:title"]).slice(
    0,
    CONTENT_LIMITS.maxTitleChars,
  );
  const videoId = firstText(entry["yt:videoId"]);
  const rawLink =
    entryLink(entry) ||
    (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "");
  const url = rawLink ? resolveFeedUrl(rawLink, options.baseUrl) : null;

  if (!title || !url) return null;

  const description = firstText(
    group?.["media:description"],
    entry["media:description"],
    entry.content,
    entry.summary,
  );
  const excerpt = stripHtml(description).slice(
    0,
    CONTENT_LIMITS.maxExcerptChars,
  );
  const thumbnail = mediaUrl(entry);
  const author =
    firstText(entry.author).slice(0, CONTENT_LIMITS.maxAuthorChars) || null;
  const community = firstObject(group?.["media:community"]);
  const statistics = firstObject(community?.["media:statistics"]);
  const stars = firstObject(community?.["media:starRating"]);
  const rating = numberAttr(stars, "average");

  return {
    externalId: videoId || firstText(entry.id) || null,
    kind: "video",
    title,
    url,
    excerpt,
    bodyHtml: plainTextBody(description),
    author,
    publishedAt: publishedAt(firstText(entry.published, entry.updated), now),
    thumbnailUrl: thumbnail
      ? resolveFeedUrl(thumbnail, options.baseUrl)
      : videoId
        ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`
        : null,
    videoId: videoId || null,
    tags: entryTags(entry, options.tags),
    metrics: {
      views: numberAttr(statistics, "views") ?? 0,
      likes: 0,
      youtubeComments: 0,
      rating: rating !== null && rating > 0 ? Math.min(5, rating) : null,
    },
  };
}
