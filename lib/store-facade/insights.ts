import * as analytics from "../storage/store/analytics.ts";
import * as benchmarks from "../storage/store/benchmarks.ts";
import * as operations from "../storage/store/operations.ts";
import * as overview from "../storage/store/overview.ts";

import { bound } from "./bound.ts";

/**
 * Reporting and operations façade (FID-086, step 4).
 *
 * These are the surfaces an operator page renders, so a wrong wiring is visible
 * rather than silent: the dashboard, analytics and operations pages all read
 * through these names after the sweep.
 *
 * Two exports are deliberately not bound:
 *
 * - `ANALYTICS_RANGES` and `normalizeAnalyticsRange` are pure policy. Wrapping
 *   them in a database call would make a range validation depend on a
 *   connection, and the admin page normalizes the range before it reads.
 * - `getOperationsThresholds` reads the environment, not the database. It stays
 *   synchronous so a page can validate a threshold without opening one.
 */

export { ANALYTICS_RANGES, normalizeAnalyticsRange } from "../analytics.ts";
export type { AnalyticsRange } from "../analytics.ts";

export const getAnalyticsData = bound(analytics.getAnalyticsData);

export const getOverview = bound(overview.getOverview);
export const getOverviewStats = bound(overview.getOverviewStats);
export const getLandingData = bound(overview.getLandingData);
export const getCatalogData = bound(overview.getCatalogData);
export const getAdminOverview = bound(overview.getAdminOverview);

export const getAdmissionControl = bound(operations.getAdmissionControl);
export const getOperationsSnapshot = bound(operations.getOperationsSnapshot);
export const listOperationIncidents = bound(operations.listOperationIncidents);
export const acknowledgeOperationIncident = bound(
  operations.acknowledgeOperationIncident,
);
export const setAdmissionState = bound(operations.setAdmissionState);
export const runOperationsMonitor = bound(operations.runOperationsMonitor);
export { getOperationsThresholds } from "../storage/store/operations.ts";

export const getBenchmarkStatus = bound(benchmarks.getBenchmarkStatus);
export const latestSuccessfulSync = bound(benchmarks.latestSuccessfulSync);
export const latestSyncAttempt = bound(benchmarks.latestSyncAttempt);
export const listBenchmarks = bound(benchmarks.listBenchmarks);
export const syncLeaseHeld = bound(benchmarks.syncLeaseHeld);
export const claimSyncLease = bound(benchmarks.claimSyncLease);
export const releaseSyncLease = bound(benchmarks.releaseSyncLease);
export const beginSync = bound(benchmarks.beginSync);
export const completeSync = bound(benchmarks.completeSync);
export const failSync = bound(benchmarks.failSync);
export const writeBenchmarks = bound(benchmarks.writeBenchmarks);
