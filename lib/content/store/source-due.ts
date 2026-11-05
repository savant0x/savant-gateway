import type { PostgresDatabase } from "../../storage/pg-adapter.ts";

import { DUE_SOURCE_PREDICATE } from "./sources.ts";

/** Total due inventory, not merely the current bounded page. */
export async function countDueSources(
  db: PostgresDatabase,
  now = new Date().toISOString(),
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM content.sources s
        WHERE ${DUE_SOURCE_PREDICATE}`,
    )
    .get<{ total: number | string }>(now);

  return Number(row?.total ?? 0);
}
