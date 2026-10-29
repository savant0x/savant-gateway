import "server-only";

import type { OpenRouterModel } from "./price-comparison";

import { parseOpenRouterModels } from "./price-comparison";

const DEFAULT_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4_000;

type CacheEntry = {
  fetchedAt: number;
  models: OpenRouterModel[];
};

type GlobalCache = typeof globalThis & {
  openRouterModelsCache?: CacheEntry;
  openRouterModelsInflight?: Promise<CacheEntry>;
};

const globalCache = globalThis as GlobalCache;

function cacheKey() {
  return process.env.OPENROUTER_MODELS_URL?.trim() || DEFAULT_URL;
}

async function load(): Promise<CacheEntry> {
  const response = await fetch(cacheKey(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`OpenRouter returned HTTP ${response.status}`);
  }

  return {
    fetchedAt: Date.now(),
    models: parseOpenRouterModels(await response.json()),
  };
}

/**
 * Public list price benchmark. Fail-open by design: an outage or an invalid
 * payload yields an empty list, and the catalog renders without comparisons.
 */
export async function getOpenRouterModels(): Promise<CacheEntry> {
  const cached = globalCache.openRouterModelsCache;

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  if (globalCache.openRouterModelsInflight) {
    return globalCache.openRouterModelsInflight;
  }

  const request = load()
    .then((entry) => {
      globalCache.openRouterModelsCache = entry;

      return entry;
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.warn(
        `[openrouter] price benchmark unavailable: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );

      // Keep a previous good list, and retry a failed refresh in five
      // minutes instead of caching the outage for the full six hours.
      const fallback: CacheEntry = {
        fetchedAt: Date.now() - CACHE_TTL_MS + RETRY_AFTER_FAILURE_MS,
        models: cached?.models ?? [],
      };

      return fallback;
    })
    .finally(() => {
      globalCache.openRouterModelsInflight = undefined;
    });

  globalCache.openRouterModelsInflight = request;

  return request;
}
