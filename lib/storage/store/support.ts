import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  SupportKind,
  SupportStatus,
  SupportSummary,
} from "../../support.ts";

import { randomUUID } from "node:crypto";

/**
 * Support request store, ported to the async handle (FID-085 step 4).
 *
 * Support is the operator's only visibility into a customer whose call failed
 * and whose credit is already gone, so the ordering here is a product rule and
 * not an implementation detail: the operator queue lists open requests first,
 * then by recency, while a customer's own history is purely chronological.
 *
 * `created_at` is ISO-8601 text, so both orderings take an explicit
 * `::timestamptz` cast rather than relying on text order agreeing with time.
 */

export type SupportRequestRow = SupportSummary & {
  userId: string;
  customerName: string;
  customerEmail: string;
  updatedAt: string;
};

type Row = {
  id: string;
  user_id: string;
  customer_name: string | null;
  customer_email: string | null;
  kind: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

const SELECT = `
  s.id, s.user_id, u.name AS customer_name, u.email AS customer_email,
  s.kind, s.subject, s.message, s.status, s.created_at, s.updated_at,
  s.resolved_at, s.resolution_note
`;

function toRow(row: Row): SupportRequestRow {
  return {
    id: row.id,
    userId: row.user_id,
    customerName: row.customer_name ?? "Unknown customer",
    customerEmail: row.customer_email ?? "",
    kind: row.kind as SupportKind,
    subject: row.subject,
    message: row.message,
    status: row.status as SupportStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    resolutionNote: row.resolution_note,
  };
}

export async function createSupportRequest(
  db: PostgresDatabase,
  input: {
    userId: string;
    kind: SupportKind;
    subject: string;
    message: string;
    now?: string;
  },
) {
  const id = `support_${randomUUID()}`;
  const now = input.now ?? new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO support_requests
        (id, user_id, kind, subject, message, status, created_at, updated_at,
         resolved_at, resolution_note)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?, NULL, NULL)`,
    )
    .run(id, input.userId, input.kind, input.subject, input.message, now, now);

  return getSupportRequest(db, id);
}

export async function getSupportRequest(db: PostgresDatabase, id: string) {
  const row = await db
    .prepare(
      `SELECT ${SELECT}
         FROM support_requests s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .get<Row>(id);

  return row ? toRow(row) : null;
}

export async function listSupportRequestsForUser(
  db: PostgresDatabase,
  userId: string,
) {
  const rows = await db
    .prepare(
      `SELECT ${SELECT}
         FROM support_requests s
         JOIN users u ON u.id = s.user_id
        WHERE s.user_id = ?
        ORDER BY s.created_at::timestamptz DESC
        LIMIT 50`,
    )
    .all<Row>(userId);

  return rows.map(toRow);
}

export async function listSupportRequests(db: PostgresDatabase, limit = 100) {
  const rows = await db
    .prepare(
      `SELECT ${SELECT}
         FROM support_requests s
         JOIN users u ON u.id = s.user_id
        ORDER BY
          CASE WHEN s.status = 'open' THEN 0 ELSE 1 END,
          s.created_at::timestamptz DESC
        LIMIT ?`,
    )
    .all<Row>(Math.min(Math.max(limit, 1), 500));

  return rows.map(toRow);
}

export async function resolveSupportRequest(
  db: PostgresDatabase,
  id: string,
  note: string,
  now = new Date().toISOString(),
) {
  const existing = await db
    .prepare("SELECT status FROM support_requests WHERE id = ?")
    .get<{ status: string }>(id);

  if (!existing) return null;

  await db
    .prepare(
      `UPDATE support_requests
          SET status = 'resolved', resolved_at = ?, resolution_note = ?,
              updated_at = ?
        WHERE id = ?`,
    )
    .run(now, note || null, now, id);

  return getSupportRequest(db, id);
}

export async function countOpenSupportRequests(db: PostgresDatabase) {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS total FROM support_requests WHERE status = 'open'",
    )
    .get<{ total: number }>();

  return Number(row?.total ?? 0);
}
