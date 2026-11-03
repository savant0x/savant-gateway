import type { PostgresDatabase } from "../../storage/pg-adapter.ts";

export type ModelSearchResult = {
  id: string;
  name: string;
  family: string;
};

/** A bounded catalog lookup for the command palette. */
export async function searchModels(
  db: PostgresDatabase,
  search: string,
  limit = 3,
): Promise<ModelSearchResult[]> {
  const query = search.trim();

  if (!query) return [];

  return db
    .prepare(
      `SELECT id, name, family
         FROM models
        WHERE status = 'active' AND in_catalog = 1
          AND (name ILIKE ? OR family ILIKE ?)
        ORDER BY name ASC
        LIMIT ?`,
    )
    .all<ModelSearchResult>(
      `%${query}%`,
      `%${query}%`,
      Math.min(10, Math.max(1, limit)),
    );
}
