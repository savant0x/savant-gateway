import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  AdmissionState,
  OperationsIncident,
  OperationsSnapshot,
  OperationsThresholds,
  OperationsTickResult,
} from "../../operations-types.ts";

import {
  deliverAlert,
  readAlertTransportConfig,
} from "../../alert-transport.ts";
import {
  ADMISSION_REASON_KEY,
  ADMISSION_STATE_KEY,
  ADMISSION_UPDATED_KEY,
} from "../../operations-types.ts";
import { readOperationsThresholds } from "../../operations-thresholds.ts";
import {
  acknowledgeIncident,
  listIncidents,
  readAdmissionControl,
  readOperationsSnapshot,
  runOperationsTick,
} from "../operations/index.ts";
import {
  readBackupObservation,
  readDatabaseBytes,
} from "../operations/storage.ts";

import { saveSetting } from "./settings.ts";

/**
 * Operations store, ported to the async handle (FID-086, Batch B).
 *
 * The monitor and the admin panel share these entry points, which is the reason
 * the transport is resolved per run rather than captured at boot: pointing
 * `OPERATIONS_ALERT_WEBHOOK_URL` at a new endpoint must take effect without a
 * deploy, and an unset URL must record incidents and send nothing.
 *
 * `setAdmissionState` writes all three settings in one transaction. A state
 * without its reason would let a pause be explained by a stale operator note
 * from the previous pause, which is exactly the confusion the reason exists to
 * prevent.
 */

function nowIso() {
  return new Date().toISOString();
}

export async function getAdmissionControl(db: PostgresDatabase) {
  return readAdmissionControl(db);
}

export function getOperationsThresholds(): OperationsThresholds {
  return readOperationsThresholds(process.env);
}

async function observeStorage(db: PostgresDatabase) {
  return {
    databaseBytes: await readDatabaseBytes(db),
    ...readBackupObservation(),
  };
}

export async function getOperationsSnapshot(
  db: PostgresDatabase,
): Promise<OperationsSnapshot> {
  return readOperationsSnapshot(db, {
    now: nowIso(),
    thresholds: getOperationsThresholds(),
    storage: await observeStorage(db),
  });
}

export async function listOperationIncidents(
  db: PostgresDatabase,
  limit = 100,
): Promise<OperationsIncident[]> {
  return listIncidents(db, limit);
}

export async function acknowledgeOperationIncident(
  db: PostgresDatabase,
  id: string,
) {
  return acknowledgeIncident(db, id, nowIso());
}

export async function setAdmissionState(
  db: PostgresDatabase,
  input: { state: AdmissionState; reason?: string | null },
): Promise<
  | { ok: true; control: Awaited<ReturnType<typeof getAdmissionControl>> }
  | { ok: false; error: string }
> {
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

  await db
    .transaction(async () => {
      await saveSetting(db, ADMISSION_STATE_KEY, input.state, now);
      await saveSetting(db, ADMISSION_REASON_KEY, reason, now);
      await saveSetting(db, ADMISSION_UPDATED_KEY, now, now);
    })
    .immediate();

  return { ok: true, control: await getAdmissionControl(db) };
}

/**
 * The manual and scheduled entry points share this function. The transport is
 * resolved per run so a newly configured webhook takes effect without a restart;
 * an unset URL records incidents and sends nothing.
 */
export async function runOperationsMonitor(
  db: PostgresDatabase,
): Promise<OperationsTickResult> {
  const thresholds = getOperationsThresholds();
  const snapshot = await readOperationsSnapshot(db, {
    now: nowIso(),
    thresholds,
    storage: await observeStorage(db),
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
