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

import { randomUUID } from "node:crypto";

import { parseFeedReport } from "./feeds.ts";
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
import { enrichOspImpressions } from "./osp-impressions.ts";
import { CONTENT_LIMITS, youtubeApiKey } from "./policy.ts";
import { FETCH_POLICY } from "./url.ts";
import { SourceConfigError, type SourceFailureKind } from "./source-error.ts";
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
import {
  claimSource,
  markSourceClaimStage,
  releaseSourceClaim,
} from "./store/claims.ts";

export type IngestDeps = {
  fetchText?: FetchText;
  now?: () => string;
  /** Monotonic-ish wall clock used for deadlines and leases; tests inject it. */
  clock?: () => number;
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
  itemsSkipped: number;
  error?: string;
  /** Present on failure: a fetch error advances the streak, config does not. */
  failureKind?: SourceFailureKind;
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
): Promise<{ items: ParsedItem[]; skipped: number }> {
  const fetchText = deps.fetchText ?? defaultFetchText;

  if (source.kind === "huggingface") {
    const body = await fetchText(HUGGINGFACE_DAILY_PAPERS_URL);
    const items = parseDailyPapers(body, source.maxItems);

    await enrichGithub(items, deps);

    return { items, skipped: 0 };
  }

  if (source.kind === "trendshift") {
    const html = await fetchText(source.url);
    const items = parseTrendshiftListing(html, source.maxItems, deps.now?.());

    await enrichGithub(items, deps);

    return { items, skipped: 0 };
  }

  if (source.kind === "hackernews") {
    return {
      items: await fetchHackerNewsItems(source, {
        fetchText,
        now: deps.now?.(),
      }),
      skipped: 0,
    };
  }

  const apiKey = deps.apiKey === undefined ? youtubeApiKey() : deps.apiKey;
  const feed = await sourceFeedUrl(source, fetchText, apiKey);
  const xml = await fetchText(feed.url);
  const report = parseFeedReport(xml, {
    baseUrl: feed.baseUrl,
    sourceKind: source.kind === "youtube" ? "youtube" : "rss",
    tags: source.config.tags,
    maxItems: source.maxItems,
    now: deps.now?.(),
  });
  const items = report.items;

  if (source.kind === "youtube") {
    await enrichYouTubeMetrics(items, fetchText, apiKey);
  }

  await enrichOspImpressions(items, fetchText);
  await enrichGithub(items, deps);

  return { items, skipped: report.skipped };
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
    const { items, skipped } = await fetchSourceItems(source, deps);
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
      itemsSkipped: skipped,
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
      itemsSkipped: skipped,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown ingestion failure.";
    const failureKind: SourceFailureKind =
      error instanceof SourceConfigError ? "config" : "fetch";
    const finishedAt = now();

    await finishCycle(db, cycleId, {
      status: "error",
      finishedAt,
      itemsSeen: 0,
      itemsUpserted: 0,
      itemsSkipped: 0,
      error: message,
    });
    await recordSourceFailure(db, source.id, finishedAt, message, failureKind);

    return {
      sourceId: source.id,
      sourceLabel: source.label,
      ok: false,
      itemsSeen: 0,
      itemsUpserted: 0,
      itemsSkipped: 0,
      error: message,
      failureKind,
    };
  }
}

export type IngestRunOptions = {
  limit?: number;
  /** Total wall-clock budget for this run. Omitted means no deadline. */
  deadlineMs?: number;
  owner?: string;
  leaseMs?: number;
};

export type IngestRun = {
  results: IngestResult[];
  claimed: number;
  skipped: number;
  deadlineReached: boolean;
  owner: string;
};

/**
 * One bounded scheduled run: a total deadline, one owner per source and a
 * durable claim that survives a process death. Expired claims are reclaimed by
 * the next tick; a live claim held by another owner is skipped, not duplicated.
 */
export async function ingestDueSourcesBounded(
  db: PostgresDatabase,
  deps: IngestDeps = {},
  options: IngestRunOptions = {},
): Promise<IngestRun> {
  const limit = Math.min(50, Math.max(1, options.limit ?? 10));
  const owner = options.owner ?? `ingest_${randomUUID()}`;
  const clock = deps.clock ?? Date.now;
  const startedAt = clock();
  const deadlineAt =
    startedAt + (options.deadlineMs ?? Number.POSITIVE_INFINITY);
  const leaseMs = options.leaseMs ?? 2 * FETCH_POLICY.timeoutMs;
  const sources = await listDueSources(db, deps.now?.(), limit);
  const results: IngestResult[] = [];
  let claimed = 0;
  let skipped = 0;
  let deadlineReached = false;

  for (let index = 0; index < sources.length; index += 1) {
    if (clock() >= deadlineAt) {
      deadlineReached = true;
      skipped += sources.length - index;
      break;
    }

    const source = sources[index];
    const at = new Date(clock()).toISOString();
    const acquired = await claimSource(db, {
      sourceId: source.id,
      owner,
      at,
      expiresAt: new Date(clock() + leaseMs).toISOString(),
    });

    if (!acquired) {
      skipped += 1;
      continue;
    }

    claimed += 1;

    try {
      await markSourceClaimStage(db, source.id, owner, "ingesting");
      results.push(await ingestSource(db, source, deps));
      await markSourceClaimStage(db, source.id, owner, "done");
    } finally {
      await releaseSourceClaim(db, source.id, owner);
    }
  }

  return { results, claimed, skipped, deadlineReached, owner };
}

/** Compatibility wrapper: callers that only need the results. */
export async function ingestDueSources(
  db: PostgresDatabase,
  deps: IngestDeps = {},
  limit = 10,
): Promise<IngestResult[]> {
  return (await ingestDueSourcesBounded(db, deps, { limit })).results;
}
