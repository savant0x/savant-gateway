/**
 * Feed-validator measurement (FID-2026-1103-130).
 *
 * The conditional fetcher keeps ETag/Last-Modified and the body together in a
 * process-local map. The FID allows only durable *validator metadata*. That
 * distinction decides the measurement: after a restart a durable validator
 * would produce a 304 with no body, and the fetcher must treat that as an error
 * rather than an empty feed. So durable metadata alone saves no bandwidth — the
 * body would still have to be downloaded — while adding a schema and a failure
 * mode.
 *
 * This module makes that trade explicit with a deterministic workload. It is
 * synthetic: `restartsPerDay` is a deployment assumption, not a hosted
 * observation. The decision function names the assumption and the size at which
 * durable body+validator storage would become worth reconsidering.
 */

export type ValidatorWorkload = {
  /** Configured sources fetched on the same schedule. */
  sources: number;
  /** Fetch cycles in a day. */
  cyclesPerDay: number;
  /** Mean feed body size in bytes, including XML overhead. */
  feedBytes: number;
  /** Process cold starts in a day that lose the local cache. */
  restartsPerDay: number;
};

export type ValidatorMeasurement = {
  workload: ValidatorWorkload;
  requestsPerDay: number;
  fullDownloads: number;
  conditionalRequests: number;
  bytesWithCache: number;
  bytesWithoutValidators: number;
  savedBytes: number;
  validatorHitRate: number;
  restartDownloads: number;
  restartBytes: number;
  /** Extra bytes a durable body cache would have to store. */
  durableBodyBytes: number;
  decision: "process-local-cache" | "reconsider-durable-bodies";
  reason: string;
};

const DURABLE_BODY_THRESHOLD_BYTES = 50 * 1024 * 1024;

function bounded(value: number, minimum: number) {
  return Number.isFinite(value)
    ? Math.max(minimum, Math.floor(value))
    : minimum;
}

export function measureValidators(
  workload: ValidatorWorkload,
): ValidatorMeasurement {
  const sources = bounded(workload.sources, 1);
  const cycles = bounded(workload.cyclesPerDay, 1);
  const feedBytes = bounded(workload.feedBytes, 1);
  const restarts = Math.min(
    cycles - 1,
    bounded(workload.restartsPerDay - 1, 0),
  );
  const coldCycles = 1 + restarts;
  const downloads = sources * coldCycles;
  const requests = sources * cycles;
  const restartDownloads = sources * restarts;
  const bytesWithCache = downloads * feedBytes;
  const bytesWithoutValidators = requests * feedBytes;
  const savedBytes = bytesWithoutValidators - bytesWithCache;
  const durableBodyBytes = sources * feedBytes;
  const reconsider = durableBodyBytes >= DURABLE_BODY_THRESHOLD_BYTES;

  return {
    workload: {
      sources,
      cyclesPerDay: cycles,
      feedBytes,
      restartsPerDay: restarts + 1,
    },
    requestsPerDay: requests,
    fullDownloads: downloads,
    conditionalRequests: requests - downloads,
    bytesWithCache,
    bytesWithoutValidators,
    savedBytes,
    validatorHitRate: requests === 0 ? 0 : (requests - downloads) / requests,
    restartDownloads,
    restartBytes: restartDownloads * feedBytes,
    durableBodyBytes,
    decision: reconsider ? "reconsider-durable-bodies" : "process-local-cache",
    reason: reconsider
      ? `A durable body cache for ${sources} sources would hold at least ${durableBodyBytes} bytes. With ${restarts + 1} cold start(s) a day the process-local cache still removes ${(savedBytes / 1024 / 1024).toFixed(2)} MiB of downloads; durable bodies now warrant a measured hosted check.`
      : `Durable validator metadata alone cannot help: a restart would receive a 304 without a cached body and the fetcher fails closed. Storing bodies as well would hold ${(durableBodyBytes / 1024 / 1024).toFixed(2)} MiB for ${restartDownloads} restart download(s) a day, below the ${DURABLE_BODY_THRESHOLD_BYTES / 1024 / 1024} MiB review threshold. Keep the process-local cache.`,
  };
}
