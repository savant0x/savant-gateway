function round(value, digits = 2) {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

/**
 * Derives the verdict from measured observations and durable reconciliation.
 * Every check names its evidence; a missing target is a failure, not a pass.
 */
export function evaluateVerdict(input) {
  const { envelope, results, reconciliation, peakRssMb, dbBytes } = input;
  const targets = envelope.targets;
  const providerConcurrency = envelope.environment.providerConcurrency;
  const checks = [];
  const add = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), detail });
  };

  for (const level of results.ramp) {
    add(
      `ramp-${level.level} response classification`,
      level.unexpected === 0,
      `${level.unexpected} unexpected response(s)`,
    );
    add(
      `ramp-${level.level} every dispatch settled`,
      level.settled && level.unresolvedDelta === 0,
      `${level.settlementDelta} settlement(s), ${level.unresolvedDelta} unresolved`,
    );

    if (level.saturation) {
      add(
        `ramp-${level.level} sheds honestly instead of dropping work`,
        level.honestSaturation &&
          level.dispatched >= providerConcurrency &&
          level.providerRefusalScopes.every((scope) => scope === "provider"),
        `${level.dispatched} dispatched, scopes ${level.providerRefusalScopes.join(",")}`,
      );
    } else {
      add(
        `ramp-${level.level} admits within the target`,
        level.admittedBps >= targets.minAdmittedBps,
        `${level.admittedBps} bps admitted`,
      );
      add(
        `ramp-${level.level} latency target`,
        level.p95Ms !== null &&
          level.p95Ms <= targets.maxP95Ms &&
          level.p99Ms <= targets.maxP99Ms,
        `p95 ${level.p95Ms}ms, p99 ${level.p99Ms}ms`,
      );
    }
  }

  add(
    "steady admitted rate",
    results.steady.admittedBps >= targets.minAdmittedBps,
    `${results.steady.admittedBps} bps`,
  );
  add(
    "steady throughput",
    results.steady.rps >= targets.minSteadyAdmittedRps,
    `${results.steady.rps} admitted rps`,
  );
  add(
    "steady latency",
    results.steady.p95Ms !== null &&
      results.steady.p95Ms <= targets.maxP95Ms &&
      results.steady.p99Ms <= targets.maxP99Ms,
    `p95 ${results.steady.p95Ms}ms, p99 ${results.steady.p99Ms}ms`,
  );
  add(
    "steady has no unexpected response or unresolved call",
    results.steady.unexpected === 0 &&
      results.steady.unresolvedDelta === 0 &&
      results.steady.settled,
    `${results.steady.unexpected} unexpected, ${results.steady.unresolvedDelta} unresolved`,
  );

  add(
    "burst sheds with provider 429 rather than 5xx",
    results.burst.honestShedding && results.burst.unexpected === 0,
    `${results.burst.unexpected} unexpected, ${results.burst.refused} refused`,
  );
  add(
    "burst dispatches within the serving concurrency",
    results.burst.dispatched >= providerConcurrency,
    `${results.burst.dispatched} dispatched, concurrency ${providerConcurrency}`,
  );
  add(
    "burst settlements reconcile",
    results.burst.settled &&
      results.burst.unresolvedDelta === 0 &&
      results.burst.usageDelta === results.burst.dispatched,
    `${results.burst.usageDelta} usage / ${results.burst.dispatched} dispatched`,
  );

  add(
    "long streams complete and settle",
    results.streams.long.allCompleted &&
      results.streams.long.settled &&
      results.streams.long.unresolvedDelta === 0,
    `${results.streams.long.dispatched} dispatched, ${results.streams.long.settlementDelta} settled`,
  );
  add(
    "client cancellations settle once as cancelled",
    results.streams.cancelled.allCancelled &&
      results.streams.cancelled.settled &&
      results.streams.cancelled.unresolvedDelta === 0 &&
      results.streams.cancelled.cancelledUsage >=
        envelope.workloads.streams.cancelled,
    `${results.streams.cancelled.cancelledUsage} cancelled usage rows`,
  );

  add(
    "mixed billing admits both modes",
    results.mixedBilling.statuses["200"] ===
      envelope.workloads.mixedBilling.free +
        envelope.workloads.mixedBilling.paid,
    `${JSON.stringify(results.mixedBilling.statuses)}${
      results.mixedBilling.unexpectedDetails?.length
        ? `; ${JSON.stringify(results.mixedBilling.unexpectedDetails)}`
        : ""
    }`,
  );
  add(
    "mixed billing records free and credit sources",
    results.mixedBilling.billingSources.free ===
      envelope.workloads.mixedBilling.free &&
      results.mixedBilling.billingSources.credit ===
        envelope.workloads.mixedBilling.paid,
    JSON.stringify(results.mixedBilling.billingSources),
  );
  add(
    "free calls never debit credit",
    results.mixedBilling.freeChargedMicros === 0,
    `${results.mixedBilling.freeChargedMicros} micros charged`,
  );
  add(
    "mixed billing settles every dispatch",
    results.mixedBilling.settled &&
      results.mixedBilling.unresolvedDelta === 0,
    `${results.mixedBilling.settlementDelta} settled`,
  );

  add(
    "competing reservations cannot over-admit",
    results.reservations.dispatched === 2 &&
      results.reservations.noOverAdmission,
    `${results.reservations.dispatched} dispatched from 500 micros`,
  );
  add(
    "competing reservations cannot overdraw",
    results.reservations.noOverdraft &&
      results.reservations.account.held_micros === 0,
    JSON.stringify(results.reservations.account),
  );
  add(
    "competing reservations settle or refuse explicitly",
    results.reservations.statuses["402"] >=
      envelope.workloads.reservations.requests - 2 &&
      results.reservations.settled,
    JSON.stringify(results.reservations.statuses),
  );

  add(
    "key churn reaches the active-key ceiling and revokes",
    results.keyChurn.created === 9 &&
      results.keyChurn.refused === 3 &&
      results.keyChurn.revoked === 9 &&
      results.keyChurn.activeAfterRevoke === 1 &&
      results.keyChurn.unexpected === 0,
    JSON.stringify(results.keyChurn),
  );

  for (const fault of results.faults) {
    const label = `${fault.name} #${fault.attempt}`;

    add(`${label} status`, fault.statusOk, `${fault.status}`);
    add(`${label} durable settlement`, fault.settled, fault.usageStatus);
    add(`${label} usage status`, fault.usageOk, String(fault.usageStatus));
    add(
      `${label} charge policy`,
      fault.usageStatus !== "error" || fault.chargeOk,
      `${fault.chargedMicros} micros`,
    );
    add(`${label} latency`, fault.latencyOk, `${fault.latencyMs}ms`);
    add(`${label} completion marker`, fault.completedOk, String(fault.completed));
  }

  add("quota reset is observed and refuses stale capacity", results.quotaReset.honest, JSON.stringify({
    current: results.quotaReset.currentStatus,
    expired: results.quotaReset.expiredStatus,
    recovered: results.quotaReset.recoveredStatus,
    free: results.quotaReset.freeCallStatus,
    reason: results.quotaReset.freeRefusalReason,
    effectiveAllowance: results.quotaReset.effectiveAllowance,
    effectivePoolTokens: results.quotaReset.effectivePoolTokens,
  }));
  add(
    "database contention waits and settles",
    results.databaseContention.honest,
    `${results.databaseContention.status} in ${results.databaseContention.latencyMs}ms`,
  );
  add(
    "alert delivery failure is recorded, not hidden",
    results.alertFailure.honest,
    `exit ${results.alertFailure.exitCode}, ${results.alertFailure.attempts} attempt(s)`,
  );
  add(
    "drain refuses new work while streams finish",
    results.drain.honest,
    `${results.drain.refusedStatus}, ${results.drain.streamsCompleted} stream(s)`,
  );
  add(
    "crash leaves durable quarantine, not a second debit",
    results.crashRecovery.honest && results.crashRecovery.explicitQuarantine,
    JSON.stringify({
      admitted: results.crashRecovery.admittedBeforeRestart,
      quarantined: results.crashRecovery.quarantined,
      usage: results.crashRecovery.usageAfter,
    }),
  );
  add(
    "storage write failure retains its reservation and quarantines",
    results.storageFailure.honest,
    `${results.storageFailure.status}, ${results.storageFailure.quarantined} quarantined`,
  );

  const quarantineAllowed =
    results.crashRecovery.quarantined ===
      envelope.workloads.crash.inFlight &&
    results.storageFailure.quarantined === 1;

  add(
    "only expected crash/storage quarantine remains",
    quarantineAllowed &&
      reconciliation.quarantined.total <= targets.maxQuarantinedTotal,
    `${reconciliation.quarantined.total} quarantined`,
  );
  add(
    "no admitted call is left unresolved",
    reconciliation.settlements.admitted <= targets.maxUnresolvedSettlements,
    `${reconciliation.settlements.admitted} admitted`,
  );
  add(
    "credit balance equals the durable ledger",
    reconciliation.ledgerDifferenceMicros <=
      targets.maxLedgerDifferenceMicros,
    `${reconciliation.ledgerDifferenceMicros} micros difference`,
  );
  add(
    "held credit equals live and quarantined reservations",
    reconciliation.heldDifferenceMicros === 0,
    `${reconciliation.heldDifferenceMicros} micros difference`,
  );
  add(
    "every committed settlement has one usage row",
    reconciliation.usage.committedMismatch === 0,
    `${reconciliation.usage.committedMismatch} mismatch`,
  );
  add(
    "no fixture account has negative credit",
    reconciliation.negativeCreditUsers === 0,
    `${reconciliation.negativeCreditUsers} account(s)`,
  );
  add(
    "PostgreSQL foreign-key integrity",
    reconciliation.integrity === "ok",
    String(reconciliation.integrity),
  );
  add(
    "peak server RSS is within the budget",
    peakRssMb !== null && peakRssMb <= targets.maxPeakRssMb,
    `${peakRssMb ?? "unmeasured"} MB`,
  );
  add(
    "database size is within the budget",
    dbBytes <= targets.maxDbBytes,
    `${dbBytes} bytes`,
  );

  const eligible = results.ramp.filter(
    (level) =>
      !level.saturation &&
      level.admittedBps >= targets.minAdmittedBps &&
      level.p95Ms !== null &&
      level.p95Ms <= targets.maxP95Ms,
  );
  const peakRampRps = eligible.length
    ? Math.max(...eligible.map((level) => level.rps))
    : 0;
  // The safe cap is based on the sustained steady run, not a short ramp burst.
  const measuredRps = results.steady.rps;
  const safeRps = round(measuredRps * targets.headroomFactor, 2);

  if (peakRampRps === 0) {
    add("a measured safe ramp exists", false, "no ramp level met the target");
  }

  return {
    checks,
    failures: checks.filter((check) => !check.ok),
    pass: checks.every((check) => check.ok),
    envelopeApproved: input.envelopeApproved,
    approvalProblem: input.approvalProblem,
    measuredSafeRps: safeRps,
    measuredRps,
    peakRampRps,
    headroomFactor: targets.headroomFactor,
    bottleneck:
      results.burst.refused > 0
        ? `provider concurrency ${providerConcurrency} (burst refusals); sustained ${results.steady.rps} rps at steady p95 ${results.steady.p95Ms}ms`
        : results.steady.p95Ms !== null
          ? `steady p95 ${results.steady.p95Ms}ms at ${results.steady.rps} rps`
          : "no measured bottleneck",
  };
}
