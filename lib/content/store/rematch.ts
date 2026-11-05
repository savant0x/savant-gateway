import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type { ContentKind } from "../types.ts";

import { randomUUID } from "node:crypto";

import { suggestModelLinks } from "../linking.ts";
import { normalizeTags } from "../taxonomy.ts";

import { readAutomationPolicy } from "./automation.ts";
import { listLinkableModels } from "./items.ts";
import { replaceAutoLinks } from "./link-writes.ts";
import { readMatchingPolicy } from "./matching.ts";

export type RematchTrigger = "manual" | "policy" | "catalog";
export type RematchStatus =
  "running" | "paused" | "ok" | "failed" | "interrupted";

export type RematchRun = {
  id: string;
  trigger: RematchTrigger;
  status: RematchStatus;
  startedAt: string;
  finishedAt: string | null;
  cursorItemId: string | null;
  processed: number;
  changed: number;
  error: string | null;
};

type RematchRow = {
  id: string;
  trigger: RematchTrigger;
  status: RematchStatus;
  started_at: string;
  finished_at: string | null;
  cursor_item_id: string | null;
  processed: number;
  changed: number;
  error: string | null;
};

type RematchItem = {
  id: string;
  title: string;
  kind: ContentKind;
  tags_json: string;
};

function toRun(row: RematchRow): RematchRun {
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    cursorItemId: row.cursor_item_id,
    processed: row.processed,
    changed: row.changed,
    error: row.error,
  };
}

const COLUMNS = `id, trigger, status, started_at, finished_at, cursor_item_id,
                 processed, changed, error`;

export async function getRematchRun(
  db: PostgresDatabase,
  runId: string,
): Promise<RematchRun | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM content.rematch_runs WHERE id = ?`)
    .get<RematchRow>(runId);

  return row ? toRun(row) : null;
}

export async function latestRematchRun(
  db: PostgresDatabase,
): Promise<RematchRun | null> {
  const row = await db
    .prepare(
      `SELECT ${COLUMNS} FROM content.rematch_runs
        ORDER BY started_at DESC, id DESC LIMIT 1`,
    )
    .get<RematchRow>();

  return row ? toRun(row) : null;
}

/** Reuse an active/paused run; otherwise create a paused one with no cursor. */
export async function startRematch(
  db: PostgresDatabase,
  trigger: RematchTrigger,
  now = new Date(),
): Promise<RematchRun> {
  const active = await db
    .prepare(
      `SELECT ${COLUMNS} FROM content.rematch_runs
        WHERE status IN ('running', 'paused')
        ORDER BY started_at DESC, id DESC LIMIT 1`,
    )
    .get<RematchRow>();

  if (active) return toRun(active);

  const startedAt = now.toISOString();
  const row = await db
    .prepare(
      `INSERT INTO content.rematch_runs
        (id, trigger, status, started_at, expires_at, owner_token,
         cursor_item_id, processed, changed)
       VALUES (?, ?, 'paused', ?, ?, '', NULL, 0, 0)
       RETURNING ${COLUMNS}`,
    )
    .get<RematchRow>(
      `rematch_${randomUUID()}`,
      trigger,
      startedAt,
      new Date(now.getTime() + 30_000).toISOString(),
    );

  return toRun(row as RematchRow);
}

async function claim(
  db: PostgresDatabase,
  runId: string,
  owner: string,
  now: Date,
): Promise<RematchRow | null> {
  const row = await db
    .prepare(
      `UPDATE content.rematch_runs
          SET status = 'running', owner_token = ?, expires_at = ?,
              finished_at = NULL, error = NULL
        WHERE id = ?
          AND status IN ('running', 'paused')
          AND (status = 'paused' OR
               expires_at::timestamptz <= ?::timestamptz)
        RETURNING ${COLUMNS}`,
    )
    .get<RematchRow>(
      owner,
      new Date(now.getTime() + 30_000).toISOString(),
      runId,
      now.toISOString(),
    );

  return row ?? null;
}

function tagsOf(value: string): string[] {
  try {
    return normalizeTags(JSON.parse(value));
  } catch {
    return [];
  }
}

/**
 * Process one bounded batch. The cursor is a stored item id, so an interrupted
 * or paused invocation resumes exactly where it stopped. Matching runs against
 * stored titles/tags and the current catalog; it never calls a publisher.
 */
export async function runRematchBounded(
  db: PostgresDatabase,
  input: {
    runId?: string;
    trigger?: RematchTrigger;
    limit?: number;
    deadlineMs?: number;
    now?: Date;
    clock?: () => number;
  } = {},
): Promise<RematchRun> {
  const now = input.now ?? new Date();
  const clock = input.clock ?? Date.now;
  const started = clock();
  const requestedLimit = input.limit ?? 25;
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(100, Math.max(1, requestedLimit))
    : 25;
  const deadlineMs = Math.max(1, input.deadlineMs ?? 5_000);
  const run = input.runId
    ? ((await getRematchRun(db, input.runId)) ??
      (await startRematch(db, input.trigger ?? "manual", now)))
    : await startRematch(db, input.trigger ?? "manual", now);
  const owner = `rematch_${randomUUID()}`;
  const at = (): string => new Date(clock()).toISOString();
  const claimed = await claim(db, run.id, owner, now);

  // An unexpired live owner is already doing this work. Return its receipt
  // instead of starting a second pass over the same cursor.
  if (!claimed) return (await getRematchRun(db, run.id)) ?? run;

  try {
    const automation = await readAutomationPolicy(db);
    const matching = await readMatchingPolicy(db);
    const pausedReason = automation.error
      ? "The automation policy is invalid; rematch is paused."
      : !automation.policy.enabled
        ? "Automation is paused in the dashboard; no rematch work is admitted."
        : matching.error
          ? "The matching policy is invalid; rematch is paused."
          : !matching.policy.enabled
            ? "Matching is turned off; no detection or rematch work is admitted."
            : null;

    if (pausedReason) {
      const paused = await db
        .prepare(
          `UPDATE content.rematch_runs
              SET status = 'paused', finished_at = NULL, error = ?,
                  owner_token = ''
            WHERE id = ? AND owner_token = ?
            RETURNING ${COLUMNS}`,
        )
        .get<RematchRow>(pausedReason, claimed.id, owner);

      return paused
        ? toRun(paused)
        : ((await getRematchRun(db, claimed.id)) ?? run);
    }

    const models = await listLinkableModels(db);

    if (models.length === 0) {
      throw new Error("No active catalog model is available to match.");
    }

    let cursor = claimed.cursor_item_id;
    let processed = claimed.processed;
    let changed = claimed.changed;

    while (processed - claimed.processed < limit) {
      if (clock() - started >= deadlineMs) break;

      const remaining = limit - (processed - claimed.processed);
      const items = await db
        .prepare(
          `SELECT i.id, i.title, i.kind,
                  COALESCE(
                    (SELECT json_agg(t.tag ORDER BY t.tag)
                       FROM content.item_tags t WHERE t.item_id = i.id),
                    '[]'::json
                  )::text AS tags_json
             FROM content.items i
            WHERE i.id > ?
            ORDER BY i.id ASC
            LIMIT ?`,
        )
        .all<RematchItem>(cursor ?? "", remaining);

      if (items.length === 0) break;

      for (const item of items) {
        const suggestions = suggestModelLinks(
          { title: item.title, tags: tagsOf(item.tags_json), kind: item.kind },
          models,
          matching.policy,
        );
        const result = await replaceAutoLinks(db, item.id, suggestions, at());

        changed += result.matched + result.retired;
        processed += 1;
        cursor = item.id;

        if (processed - claimed.processed >= limit) break;
        if (clock() - started >= deadlineMs) break;
      }
    }

    const next = await db
      .prepare(`SELECT 1 AS present FROM content.items WHERE id > ? LIMIT 1`)
      .get<{ present: number }>(cursor ?? "");
    const more = next !== undefined;
    const status: RematchStatus = more ? "paused" : "ok";
    const finishedAt = status === "ok" ? at() : null;
    const updated = await db
      .prepare(
        `UPDATE content.rematch_runs
            SET status = ?, finished_at = ?, cursor_item_id = ?,
                processed = ?, changed = ?, error = ?, owner_token = ''
          WHERE id = ? AND owner_token = ?
          RETURNING ${COLUMNS}`,
      )
      .get<RematchRow>(
        status,
        finishedAt,
        cursor,
        processed,
        changed,
        more ? "The bounded rematch paused; the cursor is resumable." : null,
        claimed.id,
        owner,
      );

    return updated
      ? toRun(updated)
      : ((await getRematchRun(db, claimed.id)) ?? run);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown rematch failure.";
    const updated = await db
      .prepare(
        `UPDATE content.rematch_runs
            SET status = 'failed', finished_at = ?, error = ?, owner_token = ''
          WHERE id = ? AND owner_token = ?
          RETURNING ${COLUMNS}`,
      )
      .get<RematchRow>(at(), message, claimed.id, owner);

    return updated
      ? toRun(updated)
      : ((await getRematchRun(db, claimed.id)) ?? run);
  }
}
