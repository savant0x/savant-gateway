/**
 * Ingestion orchestration (FID-2026-1102-088).
 *
 * Every effect is injected or bounded: the fetcher can be replaced in a test,
 * the clock is a parameter, the response size is capped, and the item count is
 * clamped by the source row. A failed source records a cycle and increments its
 * failure streak; it never throws into a page render.
 */

import type { PostgresDatabase } from "../storage/pg-adapter.ts";
import type { ContentSource, LinkableModel, ParsedItem } from "./types.ts";

import { parseFeed, youtubeChannelId, youtubeFeedUrl } from "./feeds.ts";
import { suggestModelLinks } from "./linking.ts";
import { youtubeApiKey } from "./policy.ts";
import {
  listDueSources,
  recordSourceFailure,
  recordSourceSuccess,
} from "./store/sources.ts";
import { listLinkableModels, upsertItem } from "./store/items.ts";
import { replaceAutoLinks } from "./store/links.ts";
import { finishCycle, startCycle } from "./store/cycles.ts";
import { FETCH_POLICY } from "./url.ts";

export type FetchText = (url: string) => Promise<string>;

export type IngestDeps = {
  fetchText?: FetchText;
  now?: () => string;
  models?: LinkableModel[];
  apiKey?: string | null;
};

export type IngestResult = {
  sourceId: string;
  sourceLabel: string;
  ok: boolean;
  itemsSeen: number;
  itemsUpserted: number;
  error?: string;
};

class FetchError extends Error {}

async function defaultFetchText(url: string): Promise<string> {
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
    throw new FetchError(
      "A YouTube handle needs YOUTUBE_API_KEY; use a UC… channel id instead.",
    );
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

async function sourceFeedUrl(
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

async function fetchSourceItems(
  source: ContentSource,
  deps: IngestDeps,
): Promise<ParsedItem[]> {
  const fetchText = deps.fetchText ?? defaultFetchText;
  const apiKey = deps.apiKey === undefined ? youtubeApiKey() : deps.apiKey;
  const feed = await sourceFeedUrl(source, fetchText, apiKey);
  const xml = await fetchText(feed.url);

  return parseFeed(xml, {
    baseUrl: feed.baseUrl,
    sourceKind: source.kind,
    tags: source.config.tags,
    maxItems: source.maxItems,
    now: deps.now?.(),
  });
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
