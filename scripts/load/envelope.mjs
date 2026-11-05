import { readFile } from "node:fs/promises";
import { join } from "node:path";

const INTEGER_FIELDS = [
  "maxOfferedCalls",
  "maxUpstreamCalls",
  "maxDurationMs",
];

function integer(value, label, min = 1) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new Error(`${label} must be an integer >= ${min}.`);
  }

  return value;
}

function number(value, label, min = 0) {
  if (!Number.isFinite(value) || value < min) {
    throw new Error(`${label} must be a number >= ${min}.`);
  }

  return value;
}

function readList(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }

  return value.map((entry, index) =>
    integer(entry, `${label}[${index}]`, 1),
  );
}

/**
 * Validates the operator-editable envelope before any request is offered.
 * A malformed target is never treated as "off": the run refuses to start.
 */
export function validateEnvelope(input) {
  if (!input || typeof input !== "object") {
    throw new Error("The load envelope must be an object.");
  }

  if (input.version !== 1) {
    throw new Error("Unsupported load envelope version.");
  }

  const budget = input.budget ?? {};
  const targets = input.targets ?? {};
  const workloads = input.workloads ?? {};
  const environment = input.environment ?? {};

  if (
    !Number.isSafeInteger(environment.freePoolDailyWeightedTokens) ||
    environment.freePoolDailyWeightedTokens < 1
  ) {
    throw new Error("environment.freePoolDailyWeightedTokens must be a positive integer.");
  }

  if (
    !Number.isSafeInteger(environment.freePoolAllocationBps) ||
    environment.freePoolAllocationBps < 0 ||
    environment.freePoolAllocationBps > 10_000
  ) {
    throw new Error("environment.freePoolAllocationBps must be an integer from 0 to 10000.");
  }

  if (typeof environment.freePoolAllocationEnabled !== "boolean") {
    throw new Error("environment.freePoolAllocationEnabled must be a boolean.");
  }

  if (
    !Number.isSafeInteger(environment.freeAccountDailyCap) ||
    environment.freeAccountDailyCap < 0
  ) {
    throw new Error("environment.freeAccountDailyCap must be a non-negative integer.");
  }

  if (
    !Number.isSafeInteger(environment.fallbackFreeDailyWeightedTokens) ||
    environment.fallbackFreeDailyWeightedTokens < 1
  ) {
    throw new Error("environment.fallbackFreeDailyWeightedTokens must be a positive integer.");
  }

  if (
    !Number.isSafeInteger(environment.observedDailyWeightedTokens) ||
    environment.observedDailyWeightedTokens < 1
  ) {
    throw new Error("environment.observedDailyWeightedTokens must be a positive integer.");
  }

  for (const field of INTEGER_FIELDS) {
    integer(budget[field], `budget.${field}`);
  }

  number(targets.maxP95Ms, "targets.maxP95Ms");
  number(targets.maxP99Ms, "targets.maxP99Ms");
  number(targets.minAdmittedBps, "targets.minAdmittedBps");
  number(targets.minSteadyAdmittedRps, "targets.minSteadyAdmittedRps");
  number(targets.maxUnexpectedBps, "targets.maxUnexpectedBps", 0);
  number(targets.maxBaselineErrorBps, "targets.maxBaselineErrorBps", 0);
  number(targets.maxPeakRssMb, "targets.maxPeakRssMb");
  number(targets.maxDbBytes, "targets.maxDbBytes");
  number(targets.maxUnaccountedAdmitted, "targets.maxUnaccountedAdmitted", 0);
  number(
    targets.maxLedgerDifferenceMicros,
    "targets.maxLedgerDifferenceMicros",
    0,
  );
  number(targets.maxUnresolvedSettlements, "targets.maxUnresolvedSettlements", 0);
  number(targets.maxQuarantinedAfterCrash, "targets.maxQuarantinedAfterCrash", 0);
  number(targets.maxQuarantinedTotal, "targets.maxQuarantinedTotal", 0);
  if (!(targets.headroomFactor > 0 && targets.headroomFactor <= 1)) {
    throw new Error("targets.headroomFactor must be greater than 0 and <= 1.");
  }

  const ramp = workloads.ramp ?? {};
  const levels = readList(ramp.levels, "workloads.ramp.levels");

  if (levels.some((level, index) => index > 0 && level <= levels[index - 1])) {
    throw new Error("workloads.ramp.levels must be strictly increasing.");
  }

  integer(ramp.requestsPerLevel, "workloads.ramp.requestsPerLevel");

  for (const [name, fields] of Object.entries({
    steady: ["concurrency", "requests"],
    burst: ["concurrency", "requests"],
    streams: ["concurrency", "long", "cancelled", "frames", "frameDelayMs"],
    mixedBilling: ["concurrency", "free", "paid"],
    reservations: ["concurrency", "requests", "creditMicros", "maxTokens"],
    keyChurn: ["attempts"],
    faults: ["repeats"],
    drain: ["streams", "frames", "frameDelayMs"],
    crash: ["inFlight"],
    storageFailure: ["requests"],
  })) {
    const workload = workloads[name] ?? {};

    for (const field of fields) {
      integer(workload[field], `workloads.${name}.${field}`);
    }
  }

  return input;
}

export function offeredCalls(envelope) {
  const w = envelope.workloads;

  return (
    w.ramp.levels.length * w.ramp.requestsPerLevel +
    w.steady.requests +
    w.burst.requests +
    w.streams.long +
    w.streams.cancelled +
    w.mixedBilling.free +
    w.mixedBilling.paid +
    w.reservations.requests +
    w.keyChurn.attempts +
    6 * w.faults.repeats +
    1 +
    w.drain.streams +
    1 +
    w.crash.inFlight +
    w.storageFailure.requests
  );
}

export async function readEnvelope(repo) {
  const path = join(repo, "config", "load-envelope.json");
  const envelope = validateEnvelope(
    JSON.parse(await readFile(path, "utf8")),
  );

  const offered = offeredCalls(envelope);

  if (offered > envelope.budget.maxOfferedCalls) {
    throw new Error(
      `Envelope offers ${offered} calls, above the ${envelope.budget.maxOfferedCalls} budget.`,
    );
  }

  return { envelope, path: "config/load-envelope.json", offered };
}

/** The fixture account's own ceiling is supplied by the operator envelope. */
export function loadServerEnvironment(envelope) {
  const environment = envelope.environment;

  return {
    FREE_SHARED_RPM: "6000",
    PAID_KEY_RPM: "6000",
    PROVIDER_SHARED_RPM: String(environment.providerRpm),
    PROVIDER_SHARED_CONCURRENCY: String(environment.providerConcurrency),
    FREE_POOL_DAILY_WEIGHTED_TOKENS: String(
      environment.freePoolDailyWeightedTokens,
    ),
    FREE_POOL_ALLOCATION_BPS: String(environment.freePoolAllocationBps),
    FREE_POOL_ALLOCATION_ENABLED: String(
      environment.freePoolAllocationEnabled,
    ),
    FREE_ACCOUNT_DAILY_CAP: String(environment.freeAccountDailyCap),
    FREE_DAILY_WEIGHTED_TOKENS: String(
      environment.fallbackFreeDailyWeightedTokens,
    ),
    TRIAL_ENABLED: "false",
    GATEWAY_DISPOSABLE_START: "yes",
  };
}

export function approvalProblem(envelope) {
  const approval = envelope.operatorApproval;

  return approval?.approved === true && approval.by && approval.at
    ? null
    : "The load envelope has no dated operator approval; this run is a local measurement, not accepted production capacity.";
}
