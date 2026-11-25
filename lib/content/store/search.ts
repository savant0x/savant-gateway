import type { PostgresDatabase } from "../../storage/pg-adapter.ts";

import { displayModelId } from "../../model-identity.ts";

export type ModelSearchResult = {
  /** The display id: what a reader copies and what `/models/<id>` answers to. */
  id: string;
  name: string;
  family: string;
};

type SearchRow = {
  id: string;
  upstream_slug: string;
  name: string;
  family: string;
};

/**
 * A bounded catalog lookup for the command palette.
 *
 * The palette prints and links this id, so it is the display id rather than the
 * storage key (FID-2026-1125-002). Two rows selling the same weights collapse to
 * one entry — they already did on the catalog table — so the query oversamples
 * and the dedupe keeps the requested count honest.
 */
export async function searchModels(
  db: PostgresDatabase,
  search: string,
  limit = 3,
): Promise<ModelSearchResult[]> {
  const query = search.trim();

  if (!query) return [];

  const rows = await db
    .prepare(
      `SELECT id, upstream_slug, name, family
         FROM models
        WHERE status = 'active' AND in_catalog = 1
          AND (name ILIKE ? OR family ILIKE ?)
        ORDER BY name ASC
        LIMIT ?`,
    )
    .all<SearchRow>(
      `%${query}%`,
      `%${query}%`,
      Math.min(30, Math.max(1, limit) * 5),
    );

  const found = new Map<string, ModelSearchResult>();

  for (const row of rows) {
    const id = displayModelId(row.id, row.upstream_slug);

    if (found.has(id)) continue;

    found.set(id, { id, name: row.name, family: row.family });

    if (found.size >= Math.max(1, limit)) break;
  }

  return Array.from(found.values());
}
