import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ModelSummary } from "../../types.ts";

import { createTtlCache } from "../../cache.ts";
import { toModelSummary, type ModelRow } from "../../projections.ts";

import { MODEL_SELECT, PUBLIC_MODEL_SCOPE } from "./model-sql.ts";

/**
 * The published catalog, ported to the async handle (FID-085 step 4).
 *
 * One cache per database handle, held in a `WeakMap`, rather than one module-level
 * cache. The live version can afford a single cache because there is one
 * connection for the process lifetime. Here a handle is an argument, and a
 * shared cache would let one database's rows answer another database's query —
 * which in a test suite means a test passing on a previous test's catalog. Keying
 * by handle makes the cache lifetime follow the thing it describes.
 *
 * Display projection only. The billing lookup path is never cached: a model's
 * price and route are read fresh when a request is admitted.
 */

const PUBLIC_CATALOG_TTL_MS = 5_000;

type CatalogCache = {
  get(): ModelSummary[] | undefined;
  set(value: ModelSummary[]): void;
  clear(): void;
};

const caches = new WeakMap<object, CatalogCache>();

function cacheFor(db: PostgresDatabase): CatalogCache {
  let cache = caches.get(db);

  if (!cache) {
    cache = createTtlCache<ModelSummary[]>(
      PUBLIC_CATALOG_TTL_MS,
    ) as CatalogCache;
    caches.set(db, cache);
  }

  return cache;
}

/** Drops the memoized catalog so a visibility change is immediate. */
export function clearPublicCatalogCache(db: PostgresDatabase) {
  cacheFor(db).clear();
}

export async function listModels(
  db: PostgresDatabase,
): Promise<ModelSummary[]> {
  const cache = cacheFor(db);
  const cached = cache.get();

  if (cached) return cached;

  const rows = await db
    .prepare(
      `${MODEL_SELECT}
       JOIN providers p ON p.slug = m.upstream_slug AND p.enabled = 1
       WHERE ${PUBLIC_MODEL_SCOPE}
       ORDER BY CASE WHEN g.billing_mode = 'free' THEN 0 ELSE 1 END,
                COALESCE(g.sort_order, 9999) ASC, m.provider ASC,
                m.sort_order ASC, m.name ASC`,
    )
    .all<ModelRow>();

  const models = rows.map(toModelSummary);

  cache.set(models);

  return models;
}
