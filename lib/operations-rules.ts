import type {
  IncidentCandidate,
  OperationsSnapshot,
  OperationsThresholds,
} from "./operations-types.ts";

/** Pure rule evaluation: the same candidates are rendered and alerted. */
export function evaluateOperations(
  snapshot: OperationsSnapshot,
  thresholds: OperationsThresholds,
): IncidentCandidate[] {
  const candidates: IncidentCandidate[] = [];
  const { traffic, settlements, payments, quota, storage } = snapshot;

  if (
    traffic.requests >= thresholds.minRequests &&
    traffic.errorRateBps >= thresholds.errorRateBps
  ) {
    candidates.push({
      fingerprint: "traffic:error_rate",
      severity:
        traffic.errorRateBps >= thresholds.errorRateBps * 2
          ? "critical"
          : "warning",
      title: "Gateway error rate is above the threshold",
      detail:
        `${traffic.errors} of ${traffic.requests} calls failed in the last ` +
        `${thresholds.windowMinutes} minutes (${(traffic.errorRateBps / 100).toFixed(2)}%); ` +
        `the alert threshold is ${(thresholds.errorRateBps / 100).toFixed(2)}%.`,
    });
  }

  if (
    settlements.admitted > 0 &&
    (settlements.oldestUnresolvedAgeSeconds ?? 0) >=
      thresholds.settlementMaxAgeSeconds
  ) {
    const age = settlements.oldestUnresolvedAgeSeconds ?? 0;

    candidates.push({
      fingerprint: "settlement:unresolved",
      severity:
        age >= thresholds.settlementMaxAgeSeconds * 2 ? "critical" : "warning",
      title: "Settlements are unresolved",
      detail:
        `${settlements.admitted} admitted settlement(s) remain; the oldest is ` +
        `${Math.floor(age / 60)} minutes old. Review reconciliation and release ` +
        "quarantined holds before admitting more traffic.",
    });
  }

  if (payments.failed + payments.quarantined > 0) {
    candidates.push({
      fingerprint: "payment:failed",
      severity: "critical",
      title: "Payment events need operator attention",
      detail:
        `${payments.failed} failed and ${payments.quarantined} quarantined ` +
        "payment event(s) are recorded. A paid delivery was not credited; " +
        "verify the signed event and reconcile the payment before replaying.",
    });
  }

  if (
    payments.claimed > 0 &&
    (payments.oldestClaimedAgeSeconds ?? 0) >= thresholds.paymentMaxAgeSeconds
  ) {
    candidates.push({
      fingerprint: "payment:stale_claim",
      severity: "warning",
      title: "A payment event claim is stale",
      detail:
        `${payments.claimed} claimed payment event(s) remain; the oldest claim is ` +
        `${Math.floor((payments.oldestClaimedAgeSeconds ?? 0) / 60)} minutes old. ` +
        "A retry is safe only through the signed webhook path.",
    });
  }

  for (const low of quota.lowReserve) {
    candidates.push({
      fingerprint: `reserve:low:${low.slug}`,
      severity: "warning",
      title: `Provider ${low.slug} reserve is low`,
      detail:
        `Only ${low.remainingTokens} weighted tokens remain for ${low.slug}; ` +
        `the configured floor is ${thresholds.reserveMinTokens}.`,
    });
  }

  if (quota.errored > 0) {
    candidates.push({
      fingerprint: "quota:error",
      severity: "critical",
      title: "Provider quota is unavailable",
      detail:
        `${quota.errored} enabled provider(s) report a quota error. Calls are ` +
        "refused until a fresh observation succeeds; check the provider status " +
        "page and upstream credentials.",
    });
  }

  if (quota.stale > 0) {
    candidates.push({
      fingerprint: "quota:stale",
      severity: "warning",
      title: "Provider quota observations are stale",
      detail:
        `${quota.stale} enabled provider(s) have an observation older than ` +
        `${thresholds.quotaMaxAgeSeconds} seconds. Admission refuses unknown ` +
        "capacity; inspect the provider runtime and retry the check.",
    });
  }

  if (quota.unknown > 0) {
    candidates.push({
      fingerprint: "quota:unknown",
      severity: "warning",
      title: "Provider quota has never been observed",
      detail:
        `${quota.unknown} enabled provider(s) have no quota observation. ` +
        "The gateway cannot admit calls on unknown capacity.",
    });
  }

  if (
    thresholds.databaseMaxBytes > 0 &&
    storage.databaseBytes >= thresholds.databaseMaxBytes
  ) {
    candidates.push({
      fingerprint: "storage:database_size",
      severity: "critical",
      title: "Database volume is above its size guard",
      detail:
        `The database is ${storage.databaseBytes} bytes; the configured maximum ` +
        `is ${thresholds.databaseMaxBytes} bytes. Back up and grow the volume ` +
        "before writes fail.",
    });
  }

  if (thresholds.backupMaxAgeSeconds > 0) {
    const staleBackup =
      storage.backupCount === 0 ||
      (storage.backupAgeSeconds ?? Number.POSITIVE_INFINITY) >
        thresholds.backupMaxAgeSeconds;

    if (staleBackup) {
      candidates.push({
        fingerprint: "storage:backup_stale",
        severity: "warning",
        title: "No recent verified backup is visible",
        detail:
          storage.backupCount === 0
            ? "No backup file was found in the configured backup directory."
            : `The newest backup is ${Math.floor((storage.backupAgeSeconds ?? 0) / 60)} ` +
              `minutes old; the guard is ${Math.floor(thresholds.backupMaxAgeSeconds / 60)} minutes.`,
      });
    }
  }

  return candidates;
}
