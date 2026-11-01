import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  DeliveryKind,
  DeliveryState,
  IncidentCandidate,
  IncidentSeverity,
  IncidentStatus,
  OperationsIncident,
} from "../../operations-types.ts";

import { randomUUID } from "node:crypto";

/**
 * Durable incident ledger, ported to the async handle (FID-086, Batch B).
 *
 * The state machine is unchanged, and it is the whole point of the table: a
 * repeated warning refreshes `last_seen` without sending another alert, a
 * resolved condition that returns becomes a new alert with a reset attempt
 * counter, and warning → critical queues exactly one escalation. Delivery state
 * lives on the row so a failed webhook stays visible instead of being retried
 * invisibly.
 *
 * The port's only statement-level change is the escalation flag: SQLite passed
 * `1`/`0` into `CASE WHEN ?`, while PostgreSQL requires a boolean, so the
 * parameter is cast explicitly rather than relying on inference.
 */

type IncidentRow = {
  id: string;
  fingerprint: string;
  severity: string;
  status: string;
  title: string;
  detail: string;
  first_seen: string;
  last_seen: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  delivery_kind: string;
  delivery_state: string;
  delivery_attempts: number | string;
  last_delivery_at: string | null;
  next_attempt_at: string | null;
  last_delivery_error: string | null;
};

export function toIncident(row: IncidentRow): OperationsIncident {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    severity: row.severity as IncidentSeverity,
    status: row.status as IncidentStatus,
    title: row.title,
    detail: row.detail,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    deliveryKind: row.delivery_kind as DeliveryKind,
    deliveryState: row.delivery_state as DeliveryState,
    deliveryAttempts: Number(row.delivery_attempts),
    lastDeliveryAt: row.last_delivery_at,
    nextAttemptAt: row.next_attempt_at,
    lastDeliveryError: row.last_delivery_error,
  };
}

export async function readIncident(
  db: PostgresDatabase,
  id: string,
): Promise<OperationsIncident | null> {
  const row = await db
    .prepare("SELECT * FROM operations_incidents WHERE id = ?")
    .get<IncidentRow>(id);

  return row ? toIncident(row) : null;
}

export async function listIncidents(
  db: PostgresDatabase,
  limit = 100,
): Promise<OperationsIncident[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM operations_incidents
       ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END,
                CASE severity WHEN 'critical' THEN 0 ELSE 1 END,
                last_seen::timestamptz DESC
       LIMIT ?`,
    )
    .all<IncidentRow>(Math.min(Math.max(limit, 1), 500));

  return rows.map(toIncident);
}

/**
 * Opens, refreshes, reopens or escalates one incident. A repeated open warning
 * refreshes `last_seen` but does not send another alert; a resolved condition
 * that returns becomes a new alert; warning → critical queues an escalation.
 */
export async function recordIncident(
  db: PostgresDatabase,
  candidate: IncidentCandidate,
  now: string,
): Promise<{
  incident: OperationsIncident;
  opened: boolean;
  reopened: boolean;
}> {
  const existing = await db
    .prepare("SELECT * FROM operations_incidents WHERE fingerprint = ?")
    .get<IncidentRow>(candidate.fingerprint);

  if (!existing) {
    const id = `inc_${randomUUID()}`;
    const inserted = await db
      .prepare(
        `INSERT INTO operations_incidents
          (id, fingerprint, severity, status, title, detail, first_seen,
           last_seen, acknowledged_at, resolved_at, delivery_kind,
           delivery_state, delivery_attempts, last_delivery_at,
           next_attempt_at, last_delivery_error)
         VALUES (?, ?, ?, 'open', ?, ?, ?, ?, NULL, NULL, 'alert',
                 'pending', 0, NULL, ?, NULL)
         RETURNING *`,
      )
      .all<IncidentRow>(
        id,
        candidate.fingerprint,
        candidate.severity,
        candidate.title,
        candidate.detail,
        now,
        now,
        now,
      );

    return { incident: toIncident(inserted[0]), opened: true, reopened: false };
  }

  if (existing.status === "resolved") {
    const reopened = await db
      .prepare(
        `UPDATE operations_incidents
            SET severity = ?, status = 'open', title = ?, detail = ?,
                last_seen = ?, acknowledged_at = NULL, resolved_at = NULL,
                delivery_kind = 'alert', delivery_state = 'pending',
                delivery_attempts = 0, last_delivery_at = NULL,
                next_attempt_at = ?, last_delivery_error = NULL
          WHERE id = ?
          RETURNING *`,
      )
      .all<IncidentRow>(
        candidate.severity,
        candidate.title,
        candidate.detail,
        now,
        now,
        existing.id,
      );

    return {
      incident: toIncident(reopened[0]),
      opened: false,
      reopened: true,
    };
  }

  const escalated =
    existing.severity === "warning" && candidate.severity === "critical";
  const updated = await db
    .prepare(
      `UPDATE operations_incidents
          SET severity = ?, title = ?, detail = ?, last_seen = ?,
              delivery_kind = CASE WHEN ?::boolean THEN 'alert'
                                   ELSE delivery_kind END,
              delivery_state = CASE WHEN ?::boolean THEN 'pending'
                                    ELSE delivery_state END,
              delivery_attempts = CASE WHEN ?::boolean THEN 0
                                       ELSE delivery_attempts END,
              next_attempt_at = CASE WHEN ?::boolean THEN ?
                                     ELSE next_attempt_at END,
              last_delivery_error = CASE WHEN ?::boolean THEN NULL
                                         ELSE last_delivery_error END
        WHERE id = ?
        RETURNING *`,
    )
    .all<IncidentRow>(
      candidate.severity,
      candidate.title,
      candidate.detail,
      now,
      escalated,
      escalated,
      escalated,
      escalated,
      now,
      escalated,
      existing.id,
    );

  return {
    incident: toIncident(updated[0]),
    opened: false,
    reopened: false,
  };
}

export async function resolveIncident(
  db: PostgresDatabase,
  id: string,
  now: string,
): Promise<OperationsIncident | null> {
  const existing = await readIncident(db, id);

  if (!existing || existing.status === "resolved") return existing;

  await db
    .prepare(
      `UPDATE operations_incidents
          SET status = 'resolved', resolved_at = ?, delivery_kind = 'recovery',
              delivery_state = 'pending', delivery_attempts = 0,
              next_attempt_at = ?, last_delivery_error = NULL
        WHERE id = ? AND status = 'open'`,
    )
    .run(now, now, id);

  return readIncident(db, id);
}

/** Resolves every open fingerprint that the current evaluation no longer sees. */
export async function resolveMissingIncidents(
  db: PostgresDatabase,
  activeFingerprints: ReadonlySet<string>,
  now: string,
) {
  const rows = await db
    .prepare(
      "SELECT id, fingerprint FROM operations_incidents WHERE status = 'open'",
    )
    .all<{ id: string; fingerprint: string }>();
  let resolved = 0;

  for (const row of rows) {
    if (activeFingerprints.has(row.fingerprint)) continue;

    await resolveIncident(db, row.id, now);
    resolved += 1;
  }

  return resolved;
}

export async function acknowledgeIncident(
  db: PostgresDatabase,
  id: string,
  now: string,
) {
  const existing = await readIncident(db, id);

  if (!existing) return null;

  await db
    .prepare(
      `UPDATE operations_incidents SET acknowledged_at = ?
        WHERE id = ? AND acknowledged_at IS NULL`,
    )
    .run(now, id);

  return readIncident(db, id);
}
