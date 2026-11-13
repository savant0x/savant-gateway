/**
 * Posterior-predictive calibration of the e-process drift `delta`
 * (FID-2026-1110-002, step 3).
 *
 * `delta` pays for benign variation between two runs of the same model. It is
 * picked from a simulation, not from judgement, so the sealed value can be
 * recomputed from the recorded seed, draw count and horizon:
 *
 * 1. Draw the "true" answer distribution of one cell from
 *    `Dirichlet(reference counts + Jeffreys 0.5)`.
 * 2. Apply up to `drift` of benign per-answer variation and renormalise.
 * 3. Draw `horizon` answers from it and run the sealed e-process with
 *    `delta = 0`, keeping the log-wealth at every step.
 * 4. Solve for the smallest `delta` whose decay keeps every step below
 *    `1 / (alpha * margin)`; the log-wealth is linear in `delta`, so the answer
 *    is `max over steps of (log-wealth - log bound) / step`, floored at zero.
 * 5. Take the maximum over every cell, multiply by 1.3 and clamp to the range.
 *
 * Two limits are stated rather than hidden. The simulation runs on a **design
 * reference** (`DESIGN_REFERENCE`), a declared answer shape, because no
 * collected reference exists before step 5; `delta` therefore belongs to that
 * shape, and the receipt names the reference it used. This also measures
 * robustness to benign drift, not a false-positive rate — step 5's control arm
 * measures that.
 */

import type { CountMap } from "../stats/jsd.ts";

import {
  FINGERPRINT_CELLS,
  FINGERPRINT_SAMPLES,
  SMOOTHING,
} from "../battery.ts";
import { canonicalJson } from "../protocol.ts";
import {
  DEFAULT_ALPHA_CELL,
  buildReference,
  updateLogWealth,
  type EProcessConfig,
} from "../stats/betting.ts";
import { mulberry32 } from "../stats/jsd.ts";

export const DESIGN_REFERENCE_ID = "calibration-design-reference-v1";

/** Jeffreys prior added to every reference count before the Dirichlet draw. */
export const JEFFREYS_PRIOR = 0.5;

/**
 * One-token answers are concentrated. The shape is declared, not estimated: it
 * is the design assumption the drift calibration is conditional on.
 */
const DESIGN_SHAPE = [92, 38, 26, 18, 12, 7, 4, 3] as const;

function designCounts(cellIndex: number): CountMap {
  const counts: CountMap = {};

  DESIGN_SHAPE.forEach((count, rank) => {
    counts[`design-${(rank + cellIndex) % DESIGN_SHAPE.length}`] = count;
  });

  return counts;
}

export const DESIGN_REFERENCE: Readonly<Record<string, CountMap>> =
  Object.freeze(
    Object.fromEntries(
      FINGERPRINT_CELLS.map((cell, index) => [cell.id, designCounts(index)]),
    ),
  );

export type DeltaSimulation = {
  designReferenceId: string;
  seed: number;
  simulations: number;
  horizon: number;
  alpha: number;
  drift: number;
  margin: number;
  multiplier: number;
  floor: number;
  ceiling: number;
};

export const DEFAULT_DELTA_SIMULATION: DeltaSimulation = {
  designReferenceId: DESIGN_REFERENCE_ID,
  seed: 2_026_1112,
  simulations: 256,
  horizon: FINGERPRINT_SAMPLES,
  alpha: DEFAULT_ALPHA_CELL,
  drift: 0.08,
  margin: 2,
  multiplier: 1.3,
  floor: 0.005,
  ceiling: 0.5,
};

function assertSimulation(config: DeltaSimulation) {
  const positive = ["simulations", "horizon", "margin", "multiplier"] as const;

  for (const key of positive) {
    if (!(Number.isFinite(config[key]) && config[key] > 0)) {
      throw new RangeError(`delta: ${key} must be finite and positive.`);
    }
  }

  if (
    !Number.isInteger(config.simulations) ||
    !Number.isInteger(config.horizon) ||
    !Number.isInteger(config.seed)
  ) {
    throw new RangeError("delta: simulations, horizon and seed are integers.");
  }

  if (!(config.alpha > 0 && config.alpha < 1)) {
    throw new RangeError("delta: alpha must be inside (0, 1).");
  }

  if (!(config.drift >= 0 && config.drift < 1)) {
    throw new RangeError("delta: drift must be inside [0, 1).");
  }

  if (!(config.multiplier >= 1)) {
    throw new RangeError("delta: multiplier must be at least 1.");
  }

  if (!(config.floor >= 0 && config.floor < config.ceiling)) {
    throw new RangeError(
      "delta: floor must be non-negative and below ceiling.",
    );
  }
}

/** Box-Muller, guarded against a zero uniform draw. */
function normalDraw(random: () => number) {
  const u = Math.max(random(), Number.EPSILON);

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/** Marsaglia-Tsang gamma sampling; the boosted branch covers shape < 1. */
function gammaDraw(shape: number, random: () => number): number {
  if (shape < 1) {
    const boost = Math.max(random(), Number.EPSILON);

    return gammaDraw(shape + 1, random) * Math.pow(boost, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  for (;;) {
    let x = 0;
    let v = 0;

    do {
      x = normalDraw(random);
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;

    const u = Math.max(random(), Number.EPSILON);

    if (u < 1 - 0.0331 * x * x * x * x) return d * v;

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function dirichletDraw(
  concentration: readonly number[],
  random: () => number,
): number[] {
  const draws = concentration.map((value) => gammaDraw(value, random));
  const total = draws.reduce((sum, value) => sum + value, 0);

  if (!(total > 0)) return concentration.map(() => 0);

  return draws.map((value) => value / total);
}

/** Up to `amount` of benign per-answer variation, renormalised. */
function driftDraw(
  probabilities: readonly number[],
  amount: number,
  random: () => number,
): number[] {
  const drifted = probabilities.map(
    (value) => value * (1 + amount * (2 * random() - 1)),
  );
  const total = drifted.reduce((sum, value) => sum + value, 0);

  return drifted.map((value) => value / total);
}

function pick(
  probabilities: readonly number[],
  random: () => number,
  labels: readonly string[],
) {
  const target = random();
  let cumulative = 0;

  for (let index = 0; index < probabilities.length; index += 1) {
    cumulative += probabilities[index] ?? 0;

    if (target <= cumulative) return labels[index] ?? labels[0] ?? "";
  }

  return labels[labels.length - 1] ?? "";
}

/**
 * The log-wealth at every step with `delta = 0`, through the same
 * `updateLogWealth` the decision rule uses, so the trace cannot drift from it.
 */
function logWealthTrace(
  stream: readonly string[],
  counts: CountMap,
  alpha: number,
): number[] {
  const reference = buildReference(counts, SMOOTHING);
  const config: EProcessConfig = {
    alpha,
    lambda: 0.5,
    delta: 0,
    smoothing: SMOOTHING,
  };
  const prior: CountMap = {};
  const trace: number[] = [];

  let logWealth = 0;

  for (const category of stream) {
    logWealth = updateLogWealth({
      logWealth,
      prior,
      category,
      reference,
      config,
    });
    prior[category] = (prior[category] ?? 0) + 1;
    trace.push(logWealth);
  }

  return trace;
}

/**
 * Smallest drift that keeps every step below `logBound`. Because
 * `logWealth(t, delta) = trace[t - 1] - delta * t`, the constraint is linear
 * and the smallest feasible value is the maximum of `(trace - bound) / step`.
 */
export function smallestDelta(trace: readonly number[], logBound: number) {
  let delta = 0;

  trace.forEach((logWealth, index) => {
    delta = Math.max(delta, (logWealth - logBound) / (index + 1));
  });

  return Math.max(0, delta);
}

export type DeltaCalibration = {
  config: DeltaSimulation;
  referenceId: string;
  cells: number;
  streams: number;
  bound: number;
  rawDelta: number;
  delta: number;
  clampedTo: "floor" | "ceiling" | null;
  withinBound: boolean;
};

/**
 * Runs the sealed simulation. Deterministic for a given reference and config:
 * the same inputs always return the same `delta`.
 */
export function calibrateDelta(
  reference: Readonly<Record<string, CountMap>> = DESIGN_REFERENCE,
  config: DeltaSimulation = DEFAULT_DELTA_SIMULATION,
): DeltaCalibration {
  assertSimulation(config);

  const entries = Object.entries(reference);

  if (entries.length === 0) {
    throw new RangeError("calibrateDelta: the reference is empty.");
  }

  const logBound = Math.log(1 / (config.alpha * config.margin));

  let rawDelta = 0;
  let streams = 0;

  entries.forEach(([cellId, counts], cellIndex) => {
    if (Object.keys(counts).length === 0) {
      throw new RangeError(`calibrateDelta: cell ${cellId} has no answers.`);
    }

    const concentration = Object.values(counts).map(
      (count) => count + JEFFREYS_PRIOR,
    );
    const labels = Object.keys(counts);

    for (let simulation = 0; simulation < config.simulations; simulation += 1) {
      const random = mulberry32(config.seed + cellIndex * 65_537 + simulation);
      const truth = driftDraw(
        dirichletDraw(concentration, random),
        config.drift,
        random,
      );
      const stream = Array.from({ length: config.horizon }, () =>
        pick(truth, random, labels),
      );
      const trace = logWealthTrace(stream, counts, config.alpha);

      rawDelta = Math.max(rawDelta, smallestDelta(trace, logBound));
      streams += 1;
    }
  });

  const scaled = rawDelta * config.multiplier;
  const delta = Math.min(config.ceiling, Math.max(config.floor, scaled));
  const clampedTo =
    scaled < config.floor
      ? ("floor" as const)
      : scaled > config.ceiling
        ? ("ceiling" as const)
        : null;

  return {
    config,
    referenceId: config.designReferenceId,
    cells: entries.length,
    streams,
    bound: 1 / (config.alpha * config.margin),
    rawDelta,
    delta,
    clampedTo,
    // `rawDelta` is the exact smallest feasible drift, so the chosen value meets
    // every step's bound exactly when it is not clamped down by the ceiling.
    withinBound: delta >= rawDelta - 1e-12,
  };
}

export type DeltaCheck = { ok: true } | { ok: false; reason: string };

type FrozenDeltaSource = {
  eprocess: {
    delta: number;
    deltaRaw?: number;
    deltaStatus?: string;
    deltaSimulation?: DeltaSimulation;
  };
};

/**
 * Refuses a manifest whose frozen `delta` does not come from the recorded
 * simulation inputs. This is the step-3 analogue of the manifest hash check: a
 * hand-edited constant fails here even when every other field is intact.
 */
export function verifyFrozenDelta(
  value: FrozenDeltaSource,
  reference: Readonly<Record<string, CountMap>> = DESIGN_REFERENCE,
): DeltaCheck {
  const eprocess = value?.eprocess;

  if (!eprocess || eprocess.deltaStatus !== "frozen_step_3_simulation") {
    return { ok: false, reason: "delta is not frozen by the simulation" };
  }

  if (
    canonicalJson(eprocess.deltaSimulation) !==
    canonicalJson(DEFAULT_DELTA_SIMULATION)
  ) {
    return { ok: false, reason: "delta simulation inputs changed" };
  }

  const receipt = calibrateDelta(reference, DEFAULT_DELTA_SIMULATION);

  if (receipt.delta !== eprocess.delta) {
    return { ok: false, reason: "delta does not match the simulation" };
  }

  if (
    eprocess.deltaRaw !== undefined &&
    receipt.rawDelta !== eprocess.deltaRaw
  ) {
    return { ok: false, reason: "raw delta does not match the simulation" };
  }

  if (!receipt.withinBound) {
    return { ok: false, reason: "the frozen delta does not hold the bound" };
  }

  return { ok: true };
}
