import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ModelSummary } from "../../types.ts";

import { createTtlCache } from "../../cache.ts";
import { displayModelId } from "../../model-identity.ts";
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

const PUBLISHED_READ = `${MODEL_SELECT}
       JOIN providers p ON p.slug = m.upstream_slug AND p.enabled = 1
       WHERE ${PUBLIC_MODEL_SCOPE}`;

/**
 * One published row by id.
 *
 * The retrieve endpoint used to load the whole catalog and scan it in memory,
 * so a single-id request cost the catalog's row count (FID-2026-1124-005). It
 * applies the same scope and projection as the list, so a row that the list
 * withholds cannot be retrieved either.
 */
export async function getPublishedModel(
  db: PostgresDatabase,
  id: string,
): Promise<ModelSummary | null> {
  const row = await db
    .prepare(`${PUBLISHED_READ} AND m.id = ?`)
    .get<ModelRow>(id);

  if (row) return toModelSummary(row);

  return getPublishedModelByDisplayId(db, id);
}

/**
 * The published row a display id names, when exactly one row owns it.
 *
 * `/v1/models` publishes display ids (FID-2026-1125-002), so the retrieve path
 * has to answer to them as well as to the stored key. The leaf narrows the scan
 * to physical rows; the exact display comparison decides, and a collision returns
 * nothing rather than another seller's row. A stored id keeps its own answer: the
 * caller tries the exact read first.
 */
export async function getPublishedModelByDisplayId(
  db: PostgresDatabase,
  displayId: string,
): Promise<ModelSummary | null> {
  const leaf = displayId.split("/").filter(Boolean).pop() ?? "";

  if (!leaf) return null;

  const escaped = leaf.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const rows = await db
    .prepare(`${PUBLISHED_READ} AND (m.id = ? OR m.id LIKE ? ESCAPE '\\')`)
    .all<ModelRow>(leaf, `%/${escaped}`);

  const matches = rows
    .map(toModelSummary)
    .filter(
      (model) => displayModelId(model.id, model.upstreamSlug) === displayId,
    );

  return matches.length === 1 ? matches[0] : null;
}

export async function listModels(
  db: PostgresDatabase,
): Promise<ModelSummary[]> {
  const cache = cacheFor(db);
  const cached = cache.get();

  if (cached) return cached;

  const rows = await db
    .prepare(
      `${PUBLISHED_READ}
       ORDER BY COALESCE(g.sort_order, 9999) ASC, m.provider ASC,
                m.sort_order ASC, m.name ASC`,
    )
    .all<ModelRow>();

  const models = rows.map(toModelSummary);

  cache.set(models);

  return models;
}
