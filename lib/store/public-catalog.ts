import "server-only";

import type { ModelSummary } from "../types";

import { createTtlCache } from "../cache";
import { db } from "../db";

import { MODEL_SELECT, PUBLIC_MODEL_SCOPE } from "./model-sql";
import { type ModelRow, toModelSummary } from "./shared";

/** Display projection only; the billing lookup path is never cached. */
const publicCatalogCache = createTtlCache<ModelSummary[]>(5_000);

/** Drops the memoized catalog so a visibility change is immediate. */
export function clearPublicCatalogCache() {
  publicCatalogCache.clear();
}

export function listModels(): ModelSummary[] {
  const cached = publicCatalogCache.get();

  if (cached) return cached;

  const rows = db
    .prepare(
      `${MODEL_SELECT}
       JOIN providers p ON p.slug = m.upstream_slug AND p.enabled = 1
       WHERE ${PUBLIC_MODEL_SCOPE}
       ORDER BY CASE WHEN g.billing_mode = 'free' THEN 0 ELSE 1 END,
                COALESCE(g.sort_order, 9999) ASC, m.provider ASC,
                m.sort_order ASC, m.name ASC`,
    )
    .all() as ModelRow[];

  const models = rows.map(toModelSummary);

  publicCatalogCache.set(models);

  return models;
}
