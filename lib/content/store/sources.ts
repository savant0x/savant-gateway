import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type {
  ContentSource,
  SourceConfig,
  SourceKind,
  SourceStatus,
} from "../types.ts";

import { randomUUID } from "node:crypto";

import {
  clampIntervalMinutes,
  clampMaxItems,
  FETCH_POLICY,
  validatePublicHttpUrl,
} from "../url.ts";
import { parseSourceConfig, serializeSourceConfig } from "../taxonomy.ts";

type SourceRow = {
  id: string;
  kind: SourceKind;
  label: string;
  url: string;
  config_json: string;
  enabled: number;
  fetch_interval_minutes: number;
  max_items: number;
  status: SourceStatus;
  failure_streak: number;
  last_fetched_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

function toSource(row: SourceRow): ContentSource {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    url: row.url,
    config: parseSourceConfig(row.config_json),
    enabled: row.enabled === 1,
    fetchIntervalMinutes: row.fetch_interval_minutes,
    maxItems: row.max_items,
    status: row.status,
    failureStreak: row.failure_streak,
    lastFetchedAt: row.last_fetched_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSources(
  db: PostgresDatabase,
): Promise<ContentSource[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM content.sources
        ORDER BY enabled DESC, label ASC`,
    )
    .all<SourceRow>();

  return rows.map(toSource);
}

export async function listDueSources(
  db: PostgresDatabase,
  now = new Date().toISOString(),
  limit = 10,
): Promise<ContentSource[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM content.sources
        WHERE enabled = 1
          AND status <> 'disabled'
          AND (last_fetched_at IS NULL
               OR last_fetched_at::timestamptz
                  <= ?::timestamptz - (fetch_interval_minutes * INTERVAL '1 minute'))
        ORDER BY last_fetched_at ASC NULLS FIRST
        LIMIT ?`,
    )
    .all<SourceRow>(now, Math.min(50, Math.max(1, limit)));

  return rows.map(toSource);
}

export async function getSource(
  db: PostgresDatabase,
  id: string,
): Promise<ContentSource | null> {
  const row = await db
    .prepare("SELECT * FROM content.sources WHERE id = ?")
    .get<SourceRow>(id);

  return row ? toSource(row) : null;
}

export type SourceInput = {
  kind: SourceKind;
  label: string;
  url: string;
  config: SourceConfig;
  enabled: boolean;
  fetchIntervalMinutes: number;
  maxItems: number;
};

function cleanInput(input: SourceInput): SourceInput {
  const policy = validatePublicHttpUrl(input.url);

  if (!policy.ok) throw new Error(policy.error);

  return {
    kind: input.kind,
    label: input.label.trim().slice(0, 120),
    url: policy.url.toString(),
    config: {
      tags: input.config.tags,
      ...(input.config.channelId ? { channelId: input.config.channelId } : {}),
    },
    enabled: input.enabled,
    fetchIntervalMinutes: clampIntervalMinutes(input.fetchIntervalMinutes),
    maxItems: clampMaxItems(input.maxItems),
  };
}

export async function createSource(
  db: PostgresDatabase,
  input: SourceInput,
): Promise<ContentSource> {
  const clean = cleanInput(input);

  if (!clean.label) throw new Error("Source label is required.");

  const now = new Date().toISOString();
  const id = `src_${randomUUID()}`;

  await db
    .prepare(
      `INSERT INTO content.sources
        (id, kind, label, url, config_json, enabled, fetch_interval_minutes,
         max_items, status, failure_streak, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)`,
    )
    .run(
      id,
      clean.kind,
      clean.label,
      clean.url,
      serializeSourceConfig(clean.config),
      clean.enabled ? 1 : 0,
      clean.fetchIntervalMinutes,
      clean.maxItems,
      now,
      now,
    );

  const source = await getSource(db, id);

  if (!source) throw new Error("Source insert did not persist.");
  if (!clean.enabled) await setSourceEnabled(db, id, false);

  return (await getSource(db, id)) ?? source;
}

export async function updateSource(
  db: PostgresDatabase,
  id: string,
  input: SourceInput,
): Promise<ContentSource | null> {
  const clean = cleanInput(input);

  if (!clean.label) throw new Error("Source label is required.");

  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE content.sources
          SET kind = ?, label = ?, url = ?, config_json = ?, enabled = ?,
              fetch_interval_minutes = ?, max_items = ?, status = ?,
              failure_streak = ?, updated_at = ?
        WHERE id = ?`,
    )
    .run(
      clean.kind,
      clean.label,
      clean.url,
      serializeSourceConfig(clean.config),
      clean.enabled ? 1 : 0,
      clean.fetchIntervalMinutes,
      clean.maxItems,
      clean.enabled ? "active" : "disabled",
      clean.enabled ? 0 : FETCH_POLICY.disableAfterFailures,
      now,
      id,
    );

  return getSource(db, id);
}

export async function setSourceEnabled(
  db: PostgresDatabase,
  id: string,
  enabled: boolean,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE content.sources
          SET enabled = ?, status = ?, failure_streak = ?, last_error = NULL,
              updated_at = ?
        WHERE id = ?`,
    )
    .run(
      enabled ? 1 : 0,
      enabled ? "active" : "disabled",
      enabled ? 0 : FETCH_POLICY.disableAfterFailures,
      now,
      id,
    );

  return result.changes > 0;
}

export async function deleteSource(
  db: PostgresDatabase,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM content.sources WHERE id = ?")
    .run(id);

  return result.changes > 0;
}

export async function recordSourceSuccess(
  db: PostgresDatabase,
  id: string,
  fetchedAt: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE content.sources
          SET status = 'active', failure_streak = 0, last_fetched_at = ?,
              last_error = NULL, updated_at = ?
        WHERE id = ?`,
    )
    .run(fetchedAt, fetchedAt, id);
}

/**
 * A failed fetch is visible in two places: the cycle row and the source. Five
 * consecutive failures disable the source, which is the only automatic state
 * change; an operator re-enables it after fixing the URL.
 */
export async function recordSourceFailure(
  db: PostgresDatabase,
  id: string,
  failedAt: string,
  error: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE content.sources
          SET failure_streak = failure_streak + 1,
              status = CASE WHEN failure_streak + 1 >= ?
                            THEN 'disabled' ELSE 'error' END,
              enabled = CASE WHEN failure_streak + 1 >= ?
                             THEN 0 ELSE enabled END,
              last_fetched_at = ?,
              last_error = ?,
              updated_at = ?
        WHERE id = ?`,
    )
    .run(
      FETCH_POLICY.disableAfterFailures,
      FETCH_POLICY.disableAfterFailures,
      failedAt,
      error.slice(0, 500),
      failedAt,
      id,
    );
}
