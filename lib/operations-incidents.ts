import type { DatabaseHandle } from "./schema/columns.ts";
import type {
  DeliveryKind,
  DeliveryState,
  IncidentCandidate,
  IncidentSeverity,
  IncidentStatus,
  OperationsIncident,
} from "./operations-types.ts";

import { randomUUID } from "node:crypto";

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
  delivery_attempts: number;
  last_delivery_at: string | null;
  next_attempt_at: string | null;
  last_delivery_error: string | null;
};

function toIncident(row: IncidentRow): OperationsIncident {
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
    deliveryAttempts: row.delivery_attempts,
    lastDeliveryAt: row.last_delivery_at,
    nextAttemptAt: row.next_attempt_at,
    lastDeliveryError: row.last_delivery_error,
  };
}

export function readIncident(
  database: DatabaseHandle,
  id: string,
): OperationsIncident | null {
  const row = database
    .prepare("SELECT * FROM operations_incidents WHERE id = ?")
    .get(id) as IncidentRow | undefined;

  return row ? toIncident(row) : null;
}

export function listIncidents(
  database: DatabaseHandle,
  limit = 100,
): OperationsIncident[] {
  const rows = database
    .prepare(
      `SELECT * FROM operations_incidents
       ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END,
                CASE severity WHEN 'critical' THEN 0 ELSE 1 END,
                datetime(last_seen) DESC
       LIMIT ?`,
    )
    .all(Math.min(Math.max(limit, 1), 500)) as IncidentRow[];

  return rows.map(toIncident);
}

/**
 * Opens, refreshes, reopens or escalates one incident. A repeated open warning
 * refreshes `last_seen` but does not send another alert; a resolved condition
 * that returns becomes a new alert; warning → critical queues an escalation.
 */
export function recordIncident(
  database: DatabaseHandle,
  candidate: IncidentCandidate,
  now: string,
): { incident: OperationsIncident; opened: boolean; reopened: boolean } {
  const existing = database
    .prepare("SELECT * FROM operations_incidents WHERE fingerprint = ?")
    .get(candidate.fingerprint) as IncidentRow | undefined;

  if (!existing) {
    const id = `inc_${randomUUID()}`;

    database
      .prepare(
        `INSERT INTO operations_incidents
          (id, fingerprint, severity, status, title, detail, first_seen,
           last_seen, acknowledged_at, resolved_at, delivery_kind,
           delivery_state, delivery_attempts, last_delivery_at,
           next_attempt_at, last_delivery_error)
         VALUES (?, ?, ?, 'open', ?, ?, ?, ?, NULL, NULL, 'alert',
                 'pending', 0, NULL, ?, NULL)`,
      )
      .run(
        id,
        candidate.fingerprint,
        candidate.severity,
        candidate.title,
        candidate.detail,
        now,
        now,
        now,
      );

    return {
      incident: readIncident(database, id)!,
      opened: true,
      reopened: false,
    };
  }

  if (existing.status === "resolved") {
    database
      .prepare(
        `UPDATE operations_incidents
         SET severity = ?, status = 'open', title = ?, detail = ?,
             last_seen = ?, acknowledged_at = NULL, resolved_at = NULL,
             delivery_kind = 'alert', delivery_state = 'pending',
             delivery_attempts = 0, last_delivery_at = NULL,
             next_attempt_at = ?, last_delivery_error = NULL
         WHERE id = ?`,
      )
      .run(
        candidate.severity,
        candidate.title,
        candidate.detail,
        now,
        now,
        existing.id,
      );

    return {
      incident: readIncident(database, existing.id)!,
      opened: false,
      reopened: true,
    };
  }

  const escalated =
    existing.severity === "warning" && candidate.severity === "critical";

  database
    .prepare(
      `UPDATE operations_incidents
       SET severity = ?, title = ?, detail = ?, last_seen = ?,
           delivery_kind = CASE WHEN ? THEN 'alert' ELSE delivery_kind END,
           delivery_state = CASE WHEN ? THEN 'pending' ELSE delivery_state END,
           delivery_attempts = CASE WHEN ? THEN 0 ELSE delivery_attempts END,
           next_attempt_at = CASE WHEN ? THEN ? ELSE next_attempt_at END,
           last_delivery_error = CASE WHEN ? THEN NULL ELSE last_delivery_error END
       WHERE id = ?`,
    )
    .run(
      candidate.severity,
      candidate.title,
      candidate.detail,
      now,
      escalated ? 1 : 0,
      escalated ? 1 : 0,
      escalated ? 1 : 0,
      escalated ? 1 : 0,
      now,
      escalated ? 1 : 0,
      existing.id,
    );

  return {
    incident: readIncident(database, existing.id)!,
    opened: false,
    reopened: false,
  };
}

export function resolveIncident(
  database: DatabaseHandle,
  id: string,
  now: string,
): OperationsIncident | null {
  const existing = readIncident(database, id);

  if (!existing || existing.status === "resolved") return existing;

  database
    .prepare(
      `UPDATE operations_incidents
       SET status = 'resolved', resolved_at = ?, delivery_kind = 'recovery',
           delivery_state = 'pending', delivery_attempts = 0,
           next_attempt_at = ?, last_delivery_error = NULL
       WHERE id = ? AND status = 'open'`,
    )
    .run(now, now, id);

  return readIncident(database, id);
}

/** Resolves every open fingerprint that the current evaluation no longer sees. */
export function resolveMissingIncidents(
  database: DatabaseHandle,
  activeFingerprints: ReadonlySet<string>,
  now: string,
) {
  const rows = database
    .prepare(
      "SELECT id, fingerprint FROM operations_incidents WHERE status = 'open'",
    )
    .all() as Array<{ id: string; fingerprint: string }>;
  let resolved = 0;

  for (const row of rows) {
    if (activeFingerprints.has(row.fingerprint)) continue;

    resolveIncident(database, row.id, now);
    resolved += 1;
  }

  return resolved;
}

export function acknowledgeIncident(
  database: DatabaseHandle,
  id: string,
  now: string,
) {
  const existing = readIncident(database, id);

  if (!existing) return null;

  database
    .prepare(
      `UPDATE operations_incidents SET acknowledged_at = ?
       WHERE id = ? AND acknowledged_at IS NULL`,
    )
    .run(now, id);

  return readIncident(database, id);
}
