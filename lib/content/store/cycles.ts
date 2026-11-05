import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type { ContentStats, FetchCycle } from "../types.ts";

import { randomUUID } from "node:crypto";

import { clampPageLimit, decodeCursor, encodeCursor } from "../pagination.ts";
import { PUBLIC_LINK_STATE_SQL } from "../visibility.ts";

type CycleRow = {
  id: string;
  source_id: string | null;
  source_label: string | null;
  run_id: string | null;
  trigger: FetchCycle["trigger"];
  status: FetchCycle["status"];
  started_at: string;
  finished_at: string | null;
  items_seen: number;
  items_upserted: number;
  items_skipped: number;
  budget_stopped: number;
  error: string | null;
};

function toCycle(row: CycleRow): FetchCycle {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceLabel: row.source_label ?? "Deleted source",
    runId: row.run_id,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    itemsSeen: row.items_seen,
    itemsUpserted: row.items_upserted,
    itemsSkipped: row.items_skipped,
    budgetStopped: row.budget_stopped === 1,
    error: row.error,
  };
}

export async function startCycle(
  db: PostgresDatabase,
  sourceId: string,
  startedAt = new Date().toISOString(),
  options: {
    runId?: string | null;
    trigger?: FetchCycle["trigger"];
    sourceLabel?: string;
  } = {},
): Promise<string> {
  const id = `cyc_${randomUUID()}`;

  await db
    .prepare(
      `INSERT INTO content.fetch_cycles
        (id, source_id, status, started_at, source_label, run_id, trigger)
       VALUES (?, ?, 'running', ?, ?, ?, ?)`,
    )
    .run(
      id,
      sourceId,
      startedAt,
      options.sourceLabel ?? sourceId,
      options.runId ?? null,
      options.trigger ?? "legacy",
    );

  return id;
}

export async function finishCycle(
  db: PostgresDatabase,
  id: string,
  input: {
    status: Exclude<FetchCycle["status"], "running">;
    finishedAt: string;
    itemsSeen: number;
    itemsUpserted: number;
    itemsSkipped?: number;
    budgetStopped?: boolean;
    error?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE content.fetch_cycles
          SET status = ?, finished_at = ?, items_seen = ?, items_upserted = ?,
              items_skipped = ?, budget_stopped = ?, error = ?
        WHERE id = ?`,
    )
    .run(
      input.status,
      input.finishedAt,
      input.itemsSeen,
      input.itemsUpserted,
      Math.max(0, Math.trunc(input.itemsSkipped ?? 0)),
      input.budgetStopped ? 1 : 0,
      input.error?.slice(0, 500) ?? null,
      id,
    );
}

const CYCLE_SELECT = `SELECT c.*,
         COALESCE(c.source_label, s.label, 'Deleted source') AS source_label
    FROM content.fetch_cycles c
    LEFT JOIN content.sources s ON s.id = c.source_id`;

export async function listRecentCycles(
  db: PostgresDatabase,
  limit = 20,
): Promise<FetchCycle[]> {
  const rows = await db
    .prepare(
      `${CYCLE_SELECT}
       ORDER BY c.started_at DESC, c.id DESC
       LIMIT ?`,
    )
    .all<CycleRow>(Math.min(100, Math.max(1, limit)));

  return rows.map(toCycle);
}

export type CycleHistoryFilter = {
  sourceId?: string | null;
  runId?: string | null;
  status?: string | null;
  trigger?: string | null;
  limit?: string | null;
  cursor?: string | null;
};

const CYCLE_STATUSES = new Set([
  "running",
  "ok",
  "error",
  "paused",
  "interrupted",
]);
const CYCLE_TRIGGERS = new Set([
  "scheduled",
  "manual",
  "admin_batch",
  "legacy",
]);

export async function listCycleHistory(
  db: PostgresDatabase,
  filter: CycleHistoryFilter = {},
): Promise<{ cycles: FetchCycle[]; nextCursor: string | null }> {
  const limit = clampPageLimit(filter.limit, 25, 100);
  const clauses: string[] = [];
  const params: string[] = [];
  const cursor = decodeCursor(filter.cursor, 2);

  if (filter.sourceId) {
    clauses.push("c.source_id = ?");
    params.push(filter.sourceId);
  }

  if (filter.runId) {
    clauses.push("c.run_id = ?");
    params.push(filter.runId);
  }

  if (filter.status && CYCLE_STATUSES.has(filter.status)) {
    clauses.push("c.status = ?");
    params.push(filter.status);
  }

  if (filter.trigger && CYCLE_TRIGGERS.has(filter.trigger)) {
    clauses.push("c.trigger = ?");
    params.push(filter.trigger);
  }

  if (cursor) {
    clauses.push("(c.started_at, c.id) < (?, ?)");
    params.push(cursor[0], cursor[1]);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db
    .prepare(
      `${CYCLE_SELECT}
       ${where}
       ORDER BY c.started_at DESC, c.id DESC
       LIMIT ?`,
    )
    .all<CycleRow>(...params, String(limit + 1));
  const page = rows.slice(0, limit);
  const next =
    rows.length > limit && page.length > 0
      ? encodeCursor([
          page[page.length - 1].started_at,
          page[page.length - 1].id,
        ])
      : null;

  return { cycles: page.map(toCycle), nextCursor: next };
}

export async function contentStats(
  db: PostgresDatabase,
): Promise<ContentStats> {
  const sourceRow = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END), 0) AS enabled,
              MAX(last_fetched_at) AS last_fetched_at,
              MAX(last_success_at) AS last_success_at
         FROM content.sources`,
    )
    .get<{
      total: number | string;
      enabled: number | string;
      last_fetched_at: string | null;
      last_success_at: string | null;
    }>();

  const itemRow = await db
    .prepare("SELECT COUNT(*) AS total FROM content.items")
    .get<{ total: number | string }>();

  const linkRow = await db
    .prepare(
      `SELECT COUNT(DISTINCT item_id) AS total FROM content.model_links
        WHERE state IN (${PUBLIC_LINK_STATE_SQL})`,
    )
    .get<{ total: number | string }>();

  const engagement = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM content.comments) AS comments,
         (SELECT COUNT(*) FROM content.reactions) AS reactions,
         (SELECT COUNT(*) FROM content.saved_items) AS saved_items`,
    )
    .get<{
      comments: number | string;
      reactions: number | string;
      saved_items: number | string;
    }>();

  return {
    sources: Number(sourceRow?.total ?? 0),
    enabledSources: Number(sourceRow?.enabled ?? 0),
    items: Number(itemRow?.total ?? 0),
    linkedItems: Number(linkRow?.total ?? 0),
    comments: Number(engagement?.comments ?? 0),
    reactions: Number(engagement?.reactions ?? 0),
    savedItems: Number(engagement?.saved_items ?? 0),
    lastFetchedAt: sourceRow?.last_fetched_at ?? null,
    lastSuccessAt: sourceRow?.last_success_at ?? null,
  };
}
