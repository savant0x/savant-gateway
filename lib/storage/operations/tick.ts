import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  OperationsAlertPayload,
  OperationsDeliveryResult,
  OperationsIncident,
  OperationsSnapshot,
  OperationsThresholds,
  OperationsTickResult,
  OperationsTransport,
} from "../../operations-types.ts";

import { evaluateOperations } from "../../operations-rules.ts";

import {
  recordIncident,
  resolveMissingIncidents,
  toIncident,
} from "./incidents.ts";

/**
 * Operations tick, ported to the async handle (FID-086, Batch B).
 *
 * Ordering is deliberate and preserved: evaluate, reconcile incident rows in one
 * transaction, then attempt deliveries *outside* it. A slow or dead webhook must
 * not hold a write transaction over the whole run, and a delivery failure is
 * recorded as state rather than thrown, so one unreachable endpoint cannot stop
 * the remaining incidents from being attempted.
 *
 * The backoff is bounded (`min(900s, base * 2^(attempts-1))`) and the attempt
 * counter lives on the row, so a process restart resumes the schedule instead of
 * restarting it.
 */

const MAX_BACKOFF_SECONDS = 900;

type DeliveryRow = {
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

async function dueIncidents(db: PostgresDatabase, now: string, limit = 20) {
  const rows = await db
    .prepare(
      `SELECT * FROM operations_incidents
        WHERE delivery_state IN ('unconfigured', 'pending', 'failed')
          AND (
            (delivery_state = 'failed' AND next_attempt_at IS NOT NULL
              AND next_attempt_at::timestamptz <= ?::timestamptz)
            OR (delivery_state IN ('pending', 'unconfigured')
              AND (next_attempt_at IS NULL
                OR next_attempt_at::timestamptz <= ?::timestamptz))
          )
        ORDER BY last_seen::timestamptz ASC
        LIMIT ?`,
    )
    .all<DeliveryRow>(now, now, limit);

  return rows.map(toIncident);
}

async function markDelivered(
  db: PostgresDatabase,
  incident: OperationsIncident,
  now: string,
) {
  await db
    .prepare(
      `UPDATE operations_incidents
          SET delivery_state = 'delivered',
              delivery_attempts = delivery_attempts + 1,
              last_delivery_at = ?, next_attempt_at = NULL,
              last_delivery_error = NULL
        WHERE id = ?`,
    )
    .run(now, incident.id);
}

async function markDeliveryFailure(
  db: PostgresDatabase,
  incident: OperationsIncident,
  now: string,
  thresholds: OperationsThresholds,
  result: Extract<OperationsDeliveryResult, { ok: false }>,
) {
  if (result.unconfigured) {
    await db
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
    await db
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

  await db
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
  database: PostgresDatabase;
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

  await database
    .transaction(async () => {
      for (const candidate of candidates) {
        const result = await recordIncident(database, candidate, now);

        if (result.opened) opened += 1;
        if (result.reopened) reopened += 1;
      }
    })
    .immediate();

  const resolved = await resolveMissingIncidents(database, active, now);
  const due = await dueIncidents(database, now);
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
      await markDelivered(database, incident, now);
      delivered += 1;
    } else {
      await markDeliveryFailure(database, incident, now, thresholds, result);

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
