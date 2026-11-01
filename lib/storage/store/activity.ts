import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  ActivityInput,
  ActivityKind,
  ActivitySummary,
} from "../../activity.ts";

import {
  parseActivityMetadata,
  sanitizeActivityMetadata,
} from "../../activity.ts";
import { insertActivity } from "../ledger/activity.ts";

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
