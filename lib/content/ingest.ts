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

import { parseFeed } from "./feeds.ts";
import { plainTextBody } from "./feed-xml.ts";
import {
  defaultFetchText,
  enrichYouTubeMetrics,
  sourceFeedUrl,
  type FetchText,
} from "./ingest-fetch.ts";
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
import { listLinkableModels } from "./store/items.ts";
import { pruneMetricSnapshots } from "./store/momentum.ts";
import { upsertItem } from "./store/item-writes.ts";
import { replaceAutoLinks } from "./store/links.ts";
import { finishCycle, startCycle } from "./store/cycles.ts";
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

    // Retention is maintenance, not ingestion. A prune failure is reported
    // and retried on the next cycle; it must not disable a healthy source.
    try {
      await pruneMetricSnapshots(db, new Date(finishedAt));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[content] metric snapshot prune failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }

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
