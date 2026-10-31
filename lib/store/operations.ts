import "server-only";

import type {
  AdmissionState,
  OperationsIncident,
  OperationsSnapshot,
  OperationsThresholds,
  OperationsTickResult,
} from "../operations";

import { db, dbPath, nowIso } from "../db";
import { readStorageObservation as readStorage } from "../operations-storage";
import { deliverAlert, readAlertTransportConfig } from "../alert-transport";
import {
  acknowledgeIncident,
  ADMISSION_REASON_KEY,
  ADMISSION_STATE_KEY,
  ADMISSION_UPDATED_KEY,
  listIncidents,
  readAdmissionControl,
  readOperationsSnapshot,
  readOperationsThresholds,
  runOperationsTick,
} from "../operations";

export function getAdmissionControl() {
  return readAdmissionControl(db);
}

export function getOperationsThresholds(): OperationsThresholds {
  return readOperationsThresholds(process.env);
}

export function getOperationsSnapshot(): OperationsSnapshot {
  return readOperationsSnapshot(db, {
    now: nowIso(),
    thresholds: getOperationsThresholds(),
    storage: readStorage(dbPath),
  });
}

export function listOperationIncidents(limit = 100): OperationsIncident[] {
  return listIncidents(db, limit);
}

export function acknowledgeOperationIncident(id: string) {
  return acknowledgeIncident(db, id, nowIso());
}

export function setAdmissionState(input: {
  state: AdmissionState;
  reason?: string | null;
}):
  | { ok: true; control: ReturnType<typeof getAdmissionControl> }
  | { ok: false; error: string } {
  if (
    input.state !== "open" &&
    input.state !== "paused" &&
    input.state !== "draining"
  ) {
    return {
      ok: false,
      error: "Admission state must be open, paused or draining.",
    };
  }

  const reason = (input.reason ?? "").trim().slice(0, 500);

  if (input.state !== "open" && !reason) {
    return {
      ok: false,
      error: "A reason is required when pausing or draining admission.",
    };
  }

  const now = nowIso();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
         updated_at = excluded.updated_at`,
    ).run(ADMISSION_STATE_KEY, input.state, now);

    db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
         updated_at = excluded.updated_at`,
    ).run(ADMISSION_REASON_KEY, reason, now);

    db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
         updated_at = excluded.updated_at`,
    ).run(ADMISSION_UPDATED_KEY, now, now);
  })();

  return { ok: true, control: getAdmissionControl() };
}

/**
 * The manual and scheduled entry points share this function. The transport is
 * resolved per run so a newly configured webhook takes effect without a restart;
 * an unset URL records incidents and sends nothing.
 */
export async function runOperationsMonitor(): Promise<OperationsTickResult> {
  const thresholds = getOperationsThresholds();
  const snapshot = readOperationsSnapshot(db, {
    now: nowIso(),
    thresholds,
    storage: readStorage(dbPath),
  });
  const config = readAlertTransportConfig(process.env);

  return runOperationsTick({
    database: db,
    snapshot,
    thresholds,
    transport: (payload) => deliverAlert(payload, config),
    now: snapshot.generatedAt,
  });
}
