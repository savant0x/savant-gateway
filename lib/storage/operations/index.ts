import type { PostgresDatabase } from "../pg-adapter.ts";

export { runOperationsTick } from "./tick.ts";
export {
  acknowledgeIncident,
  listIncidents,
  readIncident,
  recordIncident,
  resolveIncident,
  resolveMissingIncidents,
} from "./incidents.ts";
export { readAdmissionControl, readOperationsSnapshot } from "./snapshot.ts";
export { readBackupObservation, readDatabaseBytes } from "./storage.ts";

/**
 * The operations read model and its delivery state machine, on the async handle.
 *
 * The split mirrors the SQLite surface: `snapshot` observes, `incidents` owns the
 * durable row and its state transitions, `tick` runs one monitor pass, `storage`
 * observes the volume. Keeping the same seams means the port is reviewable
 * function by function instead of as one rewrite.
 */
export type OperationsHandle = PostgresDatabase;
