/**
 * Single-source ingestion (FID-2026-1102-088, extended by FID-2026-1104-015).
 *
 * Every effect is injected or bounded: the fetcher can be replaced in a test,
 * the clock is a parameter, the response size is capped, and the item count is
 * clamped by the source row. A failed source records a cycle and increments its
 * failure streak; a budget pause records a resumable checkpoint instead and
 * never counts as an upstream failure.
 */

import type { PostgresDatabase } from "../storage/pg-adapter.ts";
import type {
  ContentSource,
  FetchCycle,
  GitHubRepo,
  LinkableModel,
  ParsedItem,
} from "./types.ts";

import { CHECKPOINT_VERSION, type SourceCheckpoint } from "./checkpoint.ts";
import {
  boundedFetchText,
  type IngestBudget,
  SourceBudgetPaused,
} from "./budget.ts";
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
import { SourceConfigError, type SourceFailureKind } from "./source-error.ts";
import { normalizeTags } from "./taxonomy.ts";
import { parseTrendshiftListing } from "./trendshift.ts";
import {
  clearSourceCheckpoint,
  saveSourceCheckpoint,
} from "./store/source-checkpoints.ts";
import { recordSourceFailure, recordSourceSuccess } from "./store/sources.ts";
import { listLinkableModels } from "./store/items.ts";
import { readMatchingPolicy } from "./store/matching.ts";
import { pruneMetricSnapshots } from "./store/momentum.ts";
import { upsertItem } from "./store/item-writes.ts";
import { replaceAutoLinks } from "./store/link-writes.ts";
import { finishCycle, startCycle } from "./store/cycles.ts";

export type IngestDeps = {
  fetchText?: FetchText;
  now?: () => string;
  /** Monotonic-ish wall clock used for deadlines and leases; tests inject it. */
  clock?: () => number;
  models?: LinkableModel[];
  apiKey?: string | null;
  fetchGithub?: (slug: string) => Promise<GitHubRepo | null>;
};

export type IngestOptions = {
  runId?: string | null;
  trigger?: FetchCycle["trigger"];
  budget?: IngestBudget;
  resume?: SourceCheckpoint | null;
};

export type IngestResult = {
  sourceId: string;
  sourceLabel: string;
  ok: boolean;
  /** A paused source resumes from its checkpoint; it is not a failure. */
  paused?: boolean;
  itemsSeen: number;
  itemsUpserted: number;
  itemsSkipped: number;
  error?: string;
  /** Present on failure: a fetch error advances the streak, config does not. */
  failureKind?: SourceFailureKind;
};

/** Repo facts are optional and never fail the source. */
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
  options: IngestOptions = {},
): Promise<IngestResult> {
  const now = deps.now ?? (() => new Date().toISOString());
  const startedAt = options.resume?.startedAt ?? now();
  const cycleId = await startCycle(db, source.id, startedAt, {
    runId: options.runId,
    trigger: options.trigger,
    sourceLabel: source.label,
  });
  let items: ParsedItem[] = options.resume?.items ?? [];
  let nextIndex = options.resume?.nextIndex ?? 0;
  let seen = options.resume?.seen ?? 0;
  let skipped = options.resume?.skipped ?? 0;
  let upserted = options.resume?.upserted ?? 0;

  const pause = async (
    message: string | null = null,
  ): Promise<IngestResult> => {
    if (nextIndex < items.length) {
      await saveSourceCheckpoint(db, source.id, source.configRevision, {
        version: CHECKPOINT_VERSION,
        revision: source.configRevision,
        items,
        nextIndex,
        seen,
        skipped,
        upserted,
        startedAt,
      });
    }

    const finishedAt = now();

    await finishCycle(db, cycleId, {
      status: "paused",
      finishedAt,
      itemsSeen: seen,
      itemsUpserted: upserted,
      itemsSkipped: skipped,
      budgetStopped: true,
      error: message,
    });

    return {
      sourceId: source.id,
      sourceLabel: source.label,
      ok: true,
      paused: true,
      itemsSeen: seen,
      itemsUpserted: upserted,
      itemsSkipped: skipped,
    };
  };

  try {
    if (!options.resume) {
      options.budget?.check();

      const baseFetch = deps.fetchText ?? defaultFetchText;
      const fetchText = options.budget
        ? boundedFetchText(baseFetch, options.budget)
        : baseFetch;
      const fetched = await fetchSourceItems(source, { ...deps, fetchText });

      items = fetched.items;
      skipped = fetched.skipped;
      seen = items.length;
      options.budget?.check();
    }

    const models = deps.models ?? (await listLinkableModels(db));
    const matching = await readMatchingPolicy(db);

    options.budget?.check();

    for (; nextIndex < items.length; nextIndex += 1) {
      if (options.budget?.expired()) return await pause();

      const item = items[nextIndex];
      const itemId = await upsertItem(db, source, item, now());

      if (matching.policy.enabled) {
        const suggestions = suggestModelLinks(
          { title: item.title, tags: item.tags, kind: item.kind },
          models,
          matching.policy,
        );

        await replaceAutoLinks(db, itemId, suggestions, now());
      }

      upserted += 1;
    }

    const finishedAt = now();

    await finishCycle(db, cycleId, {
      status: "ok",
      finishedAt,
      itemsSeen: seen,
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
      itemsSeen: seen,
      itemsUpserted: upserted,
      itemsSkipped: skipped,
    };
  } catch (error) {
    if (error instanceof SourceBudgetPaused) {
      return pause("The run budget was exhausted before this source finished.");
    }

    const message =
      error instanceof Error ? error.message : "Unknown ingestion failure.";
    const failureKind: SourceFailureKind =
      error instanceof SourceConfigError ? "config" : "fetch";
    const finishedAt = now();

    await clearSourceCheckpoint(db, source.id);
    await finishCycle(db, cycleId, {
      status: "error",
      finishedAt,
      itemsSeen: seen,
      itemsUpserted: upserted,
      itemsSkipped: skipped,
      error: message,
    });
    await recordSourceFailure(db, source.id, finishedAt, message, failureKind);

    return {
      sourceId: source.id,
      sourceLabel: source.label,
      ok: false,
      itemsSeen: seen,
      itemsUpserted: upserted,
      itemsSkipped: skipped,
      error: message,
      failureKind,
    };
  }
}
