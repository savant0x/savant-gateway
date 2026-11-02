import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type { ContentStats, FetchCycle } from "../types.ts";

import { randomUUID } from "node:crypto";

type CycleRow = {
  id: string;
  source_id: string;
  status: FetchCycle["status"];
  started_at: string;
  finished_at: string | null;
  items_seen: number;
  items_upserted: number;
  error: string | null;
};

function toCycle(row: CycleRow): FetchCycle {
  return {
    id: row.id,
    sourceId: row.source_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    itemsSeen: row.items_seen,
    itemsUpserted: row.items_upserted,
    error: row.error,
  };
}

export async function startCycle(
  db: PostgresDatabase,
  sourceId: string,
  startedAt = new Date().toISOString(),
): Promise<string> {
  const id = `cyc_${randomUUID()}`;

  await db
    .prepare(
      `INSERT INTO content.fetch_cycles
        (id, source_id, status, started_at)
       VALUES (?, ?, 'running', ?)`,
    )
    .run(id, sourceId, startedAt);

  return id;
}

export async function finishCycle(
  db: PostgresDatabase,
  id: string,
  input: {
    status: "ok" | "error";
    finishedAt: string;
    itemsSeen: number;
    itemsUpserted: number;
    error?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE content.fetch_cycles
          SET status = ?, finished_at = ?, items_seen = ?, items_upserted = ?,
              error = ?
        WHERE id = ?`,
    )
    .run(
      input.status,
      input.finishedAt,
      input.itemsSeen,
      input.itemsUpserted,
      input.error?.slice(0, 500) ?? null,
      id,
    );
}

export async function listRecentCycles(
  db: PostgresDatabase,
  limit = 20,
): Promise<Array<FetchCycle & { sourceLabel: string }>> {
  const rows = await db
    .prepare(
      `SELECT c.*, s.label AS source_label
         FROM content.fetch_cycles c
         JOIN content.sources s ON s.id = c.source_id
        ORDER BY c.started_at DESC
        LIMIT ?`,
    )
    .all<CycleRow & { source_label: string }>(
      Math.min(100, Math.max(1, limit)),
    );

  return rows.map((row) => ({
    ...toCycle(row),
    sourceLabel: row.source_label,
  }));
}

export async function contentStats(
  db: PostgresDatabase,
): Promise<ContentStats> {
  const sourceRow = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END), 0) AS enabled,
              MAX(last_fetched_at) AS last_fetched_at
         FROM content.sources`,
    )
    .get<{
      total: number | string;
      enabled: number | string;
      last_fetched_at: string | null;
    }>();

  const itemRow = await db
    .prepare("SELECT COUNT(*) AS total FROM content.items")
    .get<{ total: number | string }>();

  const linkRow = await db
    .prepare(
      "SELECT COUNT(DISTINCT item_id) AS total FROM content.model_links WHERE reviewed = 1",
    )
    .get<{ total: number | string }>();

  return {
    sources: Number(sourceRow?.total ?? 0),
    enabledSources: Number(sourceRow?.enabled ?? 0),
    items: Number(itemRow?.total ?? 0),
    linkedItems: Number(linkRow?.total ?? 0),
    lastFetchedAt: sourceRow?.last_fetched_at ?? null,
  };
}
