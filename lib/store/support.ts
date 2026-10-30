import "server-only";

import type { SupportKind, SupportStatus, SupportSummary } from "../support";

import { randomUUID } from "node:crypto";

import { db, nowIso } from "../db";

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

export function createSupportRequest(input: {
  userId: string;
  kind: SupportKind;
  subject: string;
  message: string;
}) {
  const id = `support_${randomUUID()}`;
  const now = nowIso();

  db.prepare(
    `INSERT INTO support_requests
      (id, user_id, kind, subject, message, status, created_at, updated_at,
       resolved_at, resolution_note)
     VALUES (?, ?, ?, ?, ?, 'open', ?, ?, NULL, NULL)`,
  ).run(id, input.userId, input.kind, input.subject, input.message, now, now);

  return getSupportRequest(id)!;
}

export function getSupportRequest(id: string) {
  const row = db
    .prepare(
      `SELECT ${SELECT}
       FROM support_requests s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .get(id) as Row | undefined;

  return row ? toRow(row) : null;
}

export function listSupportRequestsForUser(userId: string) {
  const rows = db
    .prepare(
      `SELECT ${SELECT}
       FROM support_requests s
       JOIN users u ON u.id = s.user_id
       WHERE s.user_id = ?
       ORDER BY datetime(s.created_at) DESC
       LIMIT 50`,
    )
    .all(userId) as Row[];

  return rows.map(toRow);
}

export function listSupportRequests(limit = 100) {
  const rows = db
    .prepare(
      `SELECT ${SELECT}
       FROM support_requests s
       JOIN users u ON u.id = s.user_id
       ORDER BY
         CASE WHEN s.status = 'open' THEN 0 ELSE 1 END,
         datetime(s.created_at) DESC
       LIMIT ?`,
    )
    .all(Math.min(Math.max(limit, 1), 500)) as Row[];

  return rows.map(toRow);
}

export function resolveSupportRequest(id: string, note: string) {
  const existing = db
    .prepare("SELECT status FROM support_requests WHERE id = ?")
    .get(id) as { status: string } | undefined;

  if (!existing) return null;

  const now = nowIso();

  db.prepare(
    `UPDATE support_requests
     SET status = 'resolved', resolved_at = ?, resolution_note = ?, updated_at = ?
     WHERE id = ?`,
  ).run(now, note || null, now, id);

  return getSupportRequest(id);
}

export function countOpenSupportRequests() {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS total FROM support_requests WHERE status = 'open'",
    )
    .get() as { total: number };

  return row.total;
}
