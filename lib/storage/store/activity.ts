import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  ActivityCount,
  ActivityInput,
  ActivityKind,
  ActivitySummary,
} from "../../activity.ts";

import {
  parseActivityMetadata,
  sanitizeActivityMetadata,
} from "../../activity.ts";
import { insertActivity, insertActivityOnce } from "../ledger/activity.ts";

/**
 * Activity store, ported to the async handle (FID-085 step 4).
 *
 * The allowlist, the credential refusal and the size limit stay in
 * `lib/activity.ts`: `insertActivity` imports the sanitizer from there, so the
 * two layers cannot disagree about what may be recorded. This module owns the
 * read and the best-effort wrapper.
 */

export async function recordActivity(
  db: PostgresDatabase,
  input: ActivityInput,
) {
  return insertActivity(db, input);
}

/**
 * Login and logout must not be blocked by an audit write. Money and account
 * changes use the throwing insert inside their transaction; session events use
 * this wrapper and lose the row rather than the request.
 */
export async function recordActivityBestEffort(
  db: PostgresDatabase,
  input: ActivityInput,
) {
  try {
    return await insertActivity(db, input);
  } catch {
    return null;
  }
}

/**
 * Writes one durable first-completion marker per customer. The deterministic
 * id makes a replay, retry or race a no-op; the surrounding settlement has
 * already committed, so a failed event is lost rather than rolling it back.
 */
export async function recordFirstCompletion(
  db: PostgresDatabase,
  input: {
    userId: string;
    modelId?: string | null;
    groupSlug?: string | null;
  },
) {
  const metadata: Record<string, string> = {};

  if (input.modelId) metadata.modelId = input.modelId;
  if (input.groupSlug) metadata.groupSlug = input.groupSlug;

  try {
    return await insertActivityOnce(
      db,
      {
        userId: input.userId,
        actor: "system",
        kind: "first_completion",
        entityType: "user",
        entityId: input.userId,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      },
      `first_completion_${input.userId}`,
    );
  } catch {
    return false;
  }
}

export async function activityCounts(
  db: PostgresDatabase,
  input: { since: string; until: string },
): Promise<ActivityCount[]> {
  const rows = await db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, kind, COUNT(*) AS total
         FROM activity_events
        WHERE created_at >= ? AND created_at < ?
        GROUP BY day, kind
        ORDER BY day ASC, kind ASC`,
    )
    .all<{ day: string; kind: ActivityKind; total: number | string }>(
      input.since,
      input.until,
    );

  return rows.map((row) => ({
    day: row.day,
    kind: row.kind,
    count: Number(row.total),
  }));
}

type ActivityRow = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  actor: string;
  kind: string;
  entity_type: string;
  entity_id: string | null;
  metadata: string | null;
  created_at: string;
};

export async function listActivity(
  db: PostgresDatabase,
  limit = 50,
  filters: { userId?: string; kind?: ActivityKind } = {},
): Promise<ActivitySummary[]> {
  const bounded = Math.min(100, Math.max(1, Math.trunc(limit)));
  const clauses: string[] = [];
  const values: Array<string | number> = [];

  if (filters.userId) {
    clauses.push("a.user_id = ?");
    values.push(filters.userId);
  }

  if (filters.kind) {
    clauses.push("a.kind = ?");
    values.push(filters.kind);
  }

  values.push(bounded);

  const rows = await db
    .prepare(
      `SELECT a.id, a.user_id, u.email AS user_email, a.actor, a.kind,
              a.entity_type, a.entity_id, a.metadata, a.created_at
         FROM activity_events a
         LEFT JOIN users u ON u.id = a.user_id
         ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
         ORDER BY a.created_at::timestamptz DESC, a.id DESC
         LIMIT ?`,
    )
    .all<ActivityRow>(...values);

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    actor: row.actor as ActivitySummary["actor"],
    kind: row.kind as ActivityKind,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: parseActivityMetadata(row.metadata),
    createdAt: row.created_at,
  }));
}

export { sanitizeActivityMetadata };
