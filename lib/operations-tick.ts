import type { DatabaseHandle } from "./schema/columns.ts";
import type {
  OperationsAlertPayload,
  OperationsDeliveryResult,
  OperationsIncident,
  OperationsSnapshot,
  OperationsThresholds,
  OperationsTickResult,
  OperationsTransport,
} from "./operations-types.ts";

import {
  recordIncident,
  resolveMissingIncidents,
} from "./operations-incidents.ts";
import { evaluateOperations } from "./operations-rules.ts";

const MAX_BACKOFF_SECONDS = 900;

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
    severity: row.severity as OperationsIncident["severity"],
    status: row.status as OperationsIncident["status"],
    title: row.title,
    detail: row.detail,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    deliveryKind: row.delivery_kind as OperationsIncident["deliveryKind"],
    deliveryState: row.delivery_state as OperationsIncident["deliveryState"],
    deliveryAttempts: row.delivery_attempts,
    lastDeliveryAt: row.last_delivery_at,
    nextAttemptAt: row.next_attempt_at,
    lastDeliveryError: row.last_delivery_error,
  };
}

function dueIncidents(database: DatabaseHandle, now: string, limit = 20) {
  const rows = database
    .prepare(
      `SELECT * FROM operations_incidents
       WHERE delivery_state IN ('unconfigured', 'pending', 'failed')
         AND (
           (delivery_state = 'failed' AND next_attempt_at IS NOT NULL
             AND datetime(next_attempt_at) <= datetime(?))
           OR (delivery_state IN ('pending', 'unconfigured')
             AND (next_attempt_at IS NULL
               OR datetime(next_attempt_at) <= datetime(?)))
         )
       ORDER BY datetime(last_seen) ASC
       LIMIT ?`,
    )
    .all(now, now, limit) as IncidentRow[];

  return rows.map(toIncident);
}

function markDelivered(
  database: DatabaseHandle,
  incident: OperationsIncident,
  now: string,
) {
  database
    .prepare(
      `UPDATE operations_incidents
       SET delivery_state = 'delivered', delivery_attempts = delivery_attempts + 1,
           last_delivery_at = ?, next_attempt_at = NULL,
           last_delivery_error = NULL
       WHERE id = ?`,
    )
    .run(now, incident.id);
}

function markDeliveryFailure(
  database: DatabaseHandle,
  incident: OperationsIncident,
  now: string,
  thresholds: OperationsThresholds,
  result: Extract<OperationsDeliveryResult, { ok: false }>,
) {
  if (result.unconfigured) {
    database
      .prepare(
        `UPDATE operations_incidents
         SET delivery_state = 'unconfigured', next_attempt_at = NULL,
             last_delivery_error = ?
         WHERE id = ?`,
      )
      .run(result.error.slice(0, 500), incident.id);

    return;
  }

  const attempts = incident.deliveryAttempts + 1;

  if (attempts >= thresholds.alertMaxAttempts) {
    database
      .prepare(
        `UPDATE operations_incidents
         SET delivery_state = 'failed', delivery_attempts = ?,
             last_delivery_at = ?, next_attempt_at = NULL,
             last_delivery_error = ?
         WHERE id = ?`,
      )
      .run(attempts, now, result.error.slice(0, 500), incident.id);

    return;
  }

  const backoff = Math.min(
    MAX_BACKOFF_SECONDS,
    thresholds.alertRetrySeconds * 2 ** (attempts - 1),
  );
  const next = new Date(Date.parse(now) + backoff * 1000).toISOString();

  database
    .prepare(
      `UPDATE operations_incidents
       SET delivery_state = 'failed', delivery_attempts = ?,
           last_delivery_at = ?, next_attempt_at = ?,
           last_delivery_error = ?
       WHERE id = ?`,
    )
    .run(attempts, now, next, result.error.slice(0, 500), incident.id);
}

/**
 * One monitor run: evaluate, reconcile incident rows, then attempt every due
 * delivery. Delivery is outside the incident transaction so a slow endpoint
 * cannot hold a database write lock over the whole run.
 */
export async function runOperationsTick(input: {
  database: DatabaseHandle;
  snapshot: OperationsSnapshot;
  thresholds: OperationsThresholds;
  transport: OperationsTransport;
  now?: string;
}): Promise<OperationsTickResult> {
  const { database, snapshot, thresholds, transport } = input;
  const now = input.now ?? snapshot.generatedAt;
  const candidates = evaluateOperations(snapshot, thresholds);
  const active = new Set(candidates.map((candidate) => candidate.fingerprint));
  let opened = 0;
  let reopened = 0;

  database.transaction(() => {
    for (const candidate of candidates) {
      const result = recordIncident(database, candidate, now);

      if (result.opened) opened += 1;
      if (result.reopened) reopened += 1;
    }
  })();

  const resolved = resolveMissingIncidents(database, active, now);
  const due = dueIncidents(database, now);
  let delivered = 0;
  let failed = 0;
  let unconfigured = 0;

  for (const incident of due) {
    const payload: OperationsAlertPayload = {
      id: incident.id,
      fingerprint: incident.fingerprint,
      event: incident.deliveryKind,
      severity: incident.severity,
      status: incident.status,
      title: incident.title,
      detail: incident.detail,
      firstSeen: incident.firstSeen,
      lastSeen: incident.lastSeen,
      deliveryAttempt: incident.deliveryAttempts + 1,
      at: now,
    };
    const result = await transport(payload);

    if (result.ok) {
      markDelivered(database, incident, now);
      delivered += 1;
    } else {
      markDeliveryFailure(database, incident, now, thresholds, result);

      if (result.unconfigured) unconfigured += 1;
      else failed += 1;
    }
  }

  return {
    snapshot,
    active: candidates.length,
    opened,
    reopened,
    resolved,
    delivered,
    failed,
    unconfigured,
  };
}
