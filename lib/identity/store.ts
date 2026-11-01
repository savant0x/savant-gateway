/**
 * Identity evidence store (FID-2026-1101-087).
 *
 * The implementation is split by table family so no module grows past the
 * 400-line ceiling. Every call still takes the Postgres handle explicitly, and
 * this barrel keeps `lib/identity/store.ts` the one import surface for the
 * runner and the admin routes.
 */
export { ensureProtocol, getProtocol } from "./store/protocol.ts";
export {
  claimRun,
  getRun,
  insertRun,
  isCancelRequested,
  listRuns,
  listRunsForTarget,
  requestCancel,
  setRunStatus,
  sweepStaleRuns,
} from "./store/runs.ts";
export {
  countSamples,
  deleteExpiredSamples,
  insertSample,
  listSamples,
} from "./store/samples.ts";
export { listFindings, upsertFinding } from "./store/findings.ts";
export {
  confirmMismatch,
  getPublishedVerdict,
  getVerdict,
  insertCorrection,
  listCorrections,
  publishVerdict,
  unpublishVerdict,
  upsertVerdict,
} from "./store/verdicts.ts";
export type {
  IdentityCorrectionInput,
  IdentityVerdictInput,
} from "./store/verdicts.ts";
export {
  getReference,
  insertReference,
  selectReference,
} from "./store/references.ts";
