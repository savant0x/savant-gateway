/**
 * The per-cell betting e-process for the identity calibration lab
 * (FID-2026-1110-002, step 2).
 *
 * This is the decision rule the certificate will certify; JSD stays the
 * reported effect size. Each cell's stream of answers is tested against one
 * protocol-matched reference distribution:
 *
 *   log-wealth += log((1 - lambda) + lambda * qhat(c) / p0(c)) - delta
 *
 * `p0` is the reference: additive smoothing plus a Good-Turing `<other>` floor,
 * so an unseen answer never has zero probability. `qhat` is built only from the
 * observations before `c`, so the bet is previsible. Under H0 the wealth is a
 * non-negative supermartingale with expectation at most `exp(-delta)` per step,
 * so rejecting at `wealth >= 1 / alpha` is valid at any stopping point (Ville).
 *
 * Two limits are stated rather than hidden:
 *
 * 1. `delta` is frozen by the step-3 posterior-predictive simulation rather
 *    than chosen here. The manifest records the simulation inputs and
 *    `deltaStatus: "frozen_step_3_simulation"`, and
 *    `calibration/delta.ts` recomputes the value from them. Nothing here
 *    measures a false-positive rate — the lab's control arm does that.
 * 2. The estimate is a distribution over the reference's support plus one
 *    `<other>` slot. Every answer the reference never saw lands in that one
 *    slot, which is what keeps both `p0` and `qhat` normalised and the
 *    expectation exact.
 */

import type { CountMap } from "./jsd.ts";

import { FINGERPRINT_CELLS, SMOOTHING } from "../battery.ts";

/** The residual category that absorbs every answer the reference never saw. */
export const OTHER_CATEGORY = "<other>";

/**
 * Good-Turing assigns the singleton share `N1 / N` to unseen answers. A
 * reference in which every category is a singleton would give that slot all the
 * mass and make every observed answer infinitely surprising, so the floor is
 * capped and the observed support always keeps at least half the mass.
 */
export const OTHER_FLOOR_CAP = 0.5;

export const DEFAULT_LAMBDA = 0.5;

/**
 * The step-3 simulation output. Recorded as a literal because the statistics
 * layer must not import the calibration manifest; a test pins it to the
 * manifest's `eprocess.delta` so the two cannot drift.
 */
export const DEFAULT_DELTA = 0.20735819281188994;

/**
 * Splits the verdict-level budget across the fingerprint cells. Six cells at
 * `0.01 / 6` compose to the pre-registered 0.01 by the union bound.
 */
export function cellAlpha(
  alphaVerdict = 0.01,
  cellCount = FINGERPRINT_CELLS.length,
) {
  if (!(alphaVerdict > 0 && alphaVerdict < 1)) {
    throw new RangeError("cellAlpha: alphaVerdict must be inside (0, 1).");
  }

  if (!Number.isInteger(cellCount) || cellCount < 1) {
    throw new RangeError("cellAlpha: cellCount must be a positive integer.");
  }

  return alphaVerdict / cellCount;
}

export const DEFAULT_ALPHA_CELL = cellAlpha();

/**
 * `1 / alpha`, rounded up with a tolerance so a value that is one ulp low (for
 * example `1 / (1 / 600)`) still yields the integer threshold the manifest
 * records.
 */
export function wealthThreshold(alpha: number) {
  if (!(alpha > 0 && alpha <= 1)) {
    throw new RangeError("wealthThreshold: alpha must be inside (0, 1].");
  }

  return Math.ceil(1 / alpha - 1e-9);
}

export type EProcessConfig = {
  /** Per-cell type-I budget; the verdict budget is split across cells. */
  alpha: number;
  /** Weight on the alternative in the Kelly factor, inside (0, 1]. */
  lambda: number;
  /** Drift subtracted from log-wealth at every observation. */
  delta: number;
  /** Additive smoothing for both distributions; must be positive. */
  smoothing: number;
};

export const DEFAULT_EPROCESS: EProcessConfig = {
  alpha: DEFAULT_ALPHA_CELL,
  lambda: DEFAULT_LAMBDA,
  delta: DEFAULT_DELTA,
  smoothing: SMOOTHING,
};

function assertConfig(config: EProcessConfig) {
  if (!(config.alpha > 0 && config.alpha <= 1)) {
    throw new RangeError("e-process: alpha must be inside (0, 1].");
  }

  if (!(config.lambda > 0 && config.lambda <= 1)) {
    throw new RangeError("e-process: lambda must be inside (0, 1].");
  }

  if (!(Number.isFinite(config.delta) && config.delta >= 0)) {
    throw new RangeError("e-process: delta must be finite and non-negative.");
  }

  if (!(Number.isFinite(config.smoothing) && config.smoothing > 0)) {
    throw new RangeError("e-process: smoothing must be finite and positive.");
  }
}

function assertCounts(counts: CountMap, label: string) {
  for (const count of Object.values(counts)) {
    if (!Number.isFinite(count) || count < 0) {
      throw new RangeError(`${label}: counts must be finite and non-negative.`);
    }
  }
}

/**
 * Good-Turing `<other>` mass, `N1 / N`, floored at the additive smoothing so an
 * unseen answer always has a positive probability.
 */
export function goodTuringOtherFloor(counts: CountMap, smoothing = SMOOTHING) {
  if (!(Number.isFinite(smoothing) && smoothing > 0)) {
    throw new RangeError(
      "goodTuringOtherFloor: smoothing must be finite and positive.",
    );
  }

  assertCounts(counts, "goodTuringOtherFloor");

  let total = 0;
  let singletons = 0;

  for (const count of Object.values(counts)) {
    total += count;

    if (count === 1) singletons += 1;
  }

  if (total <= 0) return 1;

  return Math.max(smoothing, Math.min(OTHER_FLOOR_CAP, singletons / total));
}

export type ReferenceDistribution = {
  counts: Readonly<CountMap>;
  categories: readonly string[];
  other: number;
  observedMass: number;
  denominator: number;
  smoothing: number;
};

/** The smoothed reference over its observed support plus the `<other>` slot. */
export function buildReference(
  counts: CountMap,
  smoothing = SMOOTHING,
): ReferenceDistribution {
  const categories = Object.keys(counts);
  const other = goodTuringOtherFloor(counts, smoothing);

  let total = 0;

  for (const count of Object.values(counts)) total += count;

  return {
    counts: { ...counts },
    categories,
    other,
    observedMass: 1 - other,
    denominator: total + smoothing * Math.max(categories.length, 1),
    smoothing,
  };
}

/**
 * `p0` for one answer. An answer outside the reference support receives the
 * `<other>` mass, so the sum over the support plus `<other>` is exactly one.
 */
export function referenceMass(
  reference: ReferenceDistribution,
  category: string,
) {
  const count = reference.counts[category];

  if (count === undefined) return reference.other;

  return (
    ((count + reference.smoothing) / reference.denominator) *
    reference.observedMass
  );
}

export type PrevisibleEstimate = {
  mass: Readonly<Record<string, number>>;
  other: number;
  total: number;
  smoothing: number;
};

/**
 * `qhat` from prior answers only. Counts the reference never saw are folded
 * into the same `<other>` slot, so the estimate sums to one and the
 * per-observation expectation is exactly `exp(-delta)` under H0.
 */
export function buildPrevisible(
  prior: CountMap,
  reference: ReferenceDistribution,
  smoothing = reference.smoothing,
) {
  assertCounts(prior, "buildPrevisible");

  const mass: Record<string, number> = {};
  let total = 0;
  let outside = 0;

  for (const [category, count] of Object.entries(prior)) {
    total += count;

    if (reference.counts[category] === undefined) outside += count;
  }

  const denominator = total + smoothing * (reference.categories.length + 1);

  for (const category of reference.categories) {
    mass[category] = ((prior[category] ?? 0) + smoothing) / denominator;
  }

  const other = (outside + smoothing) / denominator;

  mass[OTHER_CATEGORY] = other;

  return { mass, other, total, smoothing };
}

export function previsibleMass(estimate: PrevisibleEstimate, category: string) {
  return estimate.mass[category] ?? estimate.other;
}

/**
 * The Kelly mixture factor for one answer. Exported so a test can sum it over
 * the reference distribution and prove the fairness property directly.
 */
export function wealthFactor(
  reference: ReferenceDistribution,
  estimate: PrevisibleEstimate,
  category: string,
  lambda: number,
) {
  if (!(lambda > 0 && lambda <= 1)) {
    throw new RangeError("wealthFactor: lambda must be inside (0, 1].");
  }

  const p0 = referenceMass(reference, category);
  const qhat = previsibleMass(estimate, category);

  if (!(p0 > 0)) return Number.POSITIVE_INFINITY;

  return 1 - lambda + (lambda * qhat) / p0;
}

/** One previsible update of the log-wealth. */
export function updateLogWealth(input: {
  logWealth: number;
  prior: CountMap;
  category: string;
  reference: ReferenceDistribution;
  config: EProcessConfig;
}) {
  assertConfig(input.config);

  const estimate = buildPrevisible(
    input.prior,
    input.reference,
    input.config.smoothing,
  );
  const factor = wealthFactor(
    input.reference,
    estimate,
    input.category,
    input.config.lambda,
  );

  // Both masses stay above zero through smoothing, so the factor is positive
  // by construction and there is no log(0) branch to carry.
  return input.logWealth + Math.log(factor) - input.config.delta;
}

export function isRejected(
  logWealth: number,
  threshold = wealthThreshold(DEFAULT_EPROCESS.alpha),
) {
  return logWealth >= Math.log(threshold);
}

export type EProcessResult = {
  rejected: boolean;
  rejectedAt: number | null;
  steps: number;
  logWealth: number;
  wealth: number;
  threshold: number;
};

/**
 * Runs one cell's stream and stops at the first rejection (anytime-valid
 * stopping). An empty stream never rejects and reports unit wealth.
 */
export function runEProcess(
  categories: readonly string[],
  referenceCounts: CountMap,
  config: EProcessConfig = DEFAULT_EPROCESS,
): EProcessResult {
  assertConfig(config);

  const threshold = wealthThreshold(config.alpha);
  const reference = buildReference(referenceCounts, config.smoothing);
  const prior: CountMap = {};

  let logWealth = 0;
  let rejectedAt: number | null = null;
  let steps = 0;

  for (const category of categories) {
    logWealth = updateLogWealth({
      logWealth,
      prior,
      category,
      reference,
      config,
    });
    prior[category] = (prior[category] ?? 0) + 1;
    steps += 1;

    if (isRejected(logWealth, threshold)) {
      rejectedAt = steps;
      break;
    }
  }

  return {
    rejected: rejectedAt !== null,
    rejectedAt,
    steps,
    logWealth,
    wealth: Math.exp(logWealth),
    threshold,
  };
}

/**
 * The verdict rule: reject if any cell rejects. With `alphaCell` split from the
 * verdict budget the union bound keeps the verdict-level rate at `alphaVerdict`.
 */
export function verdictRejects(results: readonly EProcessResult[]) {
  return results.some((result) => result.rejected);
}
