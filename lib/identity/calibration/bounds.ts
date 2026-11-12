/**
 * Pre-registered bounds for the identity calibration lab
 * (FID-2026-1110-002, step 1).
 *
 * The two bounds answer different questions and are not interchangeable:
 * - TPR is a Wilson lower bound on held-out positives.
 * - FPR is an exact zero-event upper bound. Any observed false positive fails
 *   the predicate before the bound is compared; the bound exists so a
 *   zero-false-positive run can still be stated with a confidence limit.
 */

import { wilsonInterval } from "../stats/intervals.ts";

export type ClassId =
  | "substitution"
  | "version_swap"
  | "hidden_prompt"
  | "context_truncation"
  | "phantom_tool";

export const CLASS_IDS: readonly ClassId[] = [
  "substitution",
  "version_swap",
  "hidden_prompt",
  "context_truncation",
  "phantom_tool",
];

export type AcceptanceTargets = {
  confidence: number;
  fprUpperMax: number;
  tprLowerMin: number;
  requireZeroControlFalsePositives: boolean;
};

/** The only confidence this lab pre-registers (z = 1.96). */
export const CONFIDENCE_95 = 0.95;

export const DEFAULT_TARGETS: AcceptanceTargets = {
  confidence: CONFIDENCE_95,
  fprUpperMax: 0.01,
  tprLowerMin: 0.9,
  requireZeroControlFalsePositives: true,
};

function assertCount(successes: number, samples: number, label: string) {
  if (!Number.isInteger(samples) || samples < 0) {
    throw new RangeError(`${label}: samples must be a non-negative integer.`);
  }

  if (!Number.isInteger(successes) || successes < 0 || successes > samples) {
    throw new RangeError(`${label}: successes must be between 0 and samples.`);
  }
}

/** Lower Wilson bound at 95%; 0 when nothing was observed. */
export function wilsonLower(successes: number, samples: number, z = 1.96) {
  assertCount(successes, samples, "wilsonLower");

  return wilsonInterval(successes, samples, z).low;
}

/**
 * Exact one-sided upper bound for zero observed events:
 * `1 - (1 - confidence)^(1 / samples)`. At 0/299 and 95% this is 0.00997.
 */
export function zeroEventUpperBound(
  samples: number,
  confidence = CONFIDENCE_95,
) {
  assertCount(0, samples, "zeroEventUpperBound");

  if (!(confidence > 0 && confidence < 1)) {
    throw new RangeError(
      "zeroEventUpperBound: confidence must be inside (0, 1).",
    );
  }

  if (samples === 0) return 1;

  return 1 - Math.pow(1 - confidence, 1 / samples);
}

/** The rule of three, `3 / n`, reported next to the exact bound. */
export function ruleOfThree(samples: number) {
  assertCount(0, samples, "ruleOfThree");

  return samples === 0 ? 1 : 3 / samples;
}

export type ClassCounts = { n: number; detected: number };

export type CalibrationCounts = {
  controls: { n: number; falsePositives: number };
  positives: Record<ClassId, ClassCounts>;
};

export type ClassBound = {
  id: ClassId;
  n: number;
  detected: number;
  tprLower: number;
  passed: boolean;
};

export type AcceptanceResult = {
  accepted: boolean;
  confidence: number;
  fprUpper: number;
  classes: ClassBound[];
  failures: string[];
};

/**
 * The pre-registered predicate. Every class in `CLASS_IDS` must be present: a
 * missing class is a malformed submission, not a pass.
 */
export function evaluateAcceptance(
  counts: CalibrationCounts,
  targets: AcceptanceTargets = DEFAULT_TARGETS,
): AcceptanceResult {
  if (targets.confidence !== CONFIDENCE_95) {
    throw new RangeError(
      "evaluateAcceptance: only the pre-registered 95% confidence is supported.",
    );
  }

  if (!(targets.fprUpperMax > 0 && targets.fprUpperMax < 1)) {
    throw new RangeError(
      "evaluateAcceptance: fprUpperMax must be inside (0, 1).",
    );
  }

  if (!(targets.tprLowerMin > 0 && targets.tprLowerMin < 1)) {
    throw new RangeError(
      "evaluateAcceptance: tprLowerMin must be inside (0, 1).",
    );
  }

  const { n: controlN, falsePositives } = counts.controls;

  assertCount(falsePositives, controlN, "controls");

  const fprUpper = zeroEventUpperBound(controlN, targets.confidence);
  const failures: string[] = [];

  if (targets.requireZeroControlFalsePositives && falsePositives > 0) {
    failures.push(
      `controls observed ${falsePositives} false positive(s); the pre-registered rule requires zero`,
    );
  }

  if (fprUpper > targets.fprUpperMax) {
    failures.push(
      `FPR upper bound ${fprUpper.toFixed(5)} exceeds ${targets.fprUpperMax}`,
    );
  }

  const classes = CLASS_IDS.map((id): ClassBound => {
    const cell = counts.positives[id];

    if (!cell) {
      throw new RangeError(`evaluateAcceptance: missing class ${id}.`);
    }

    assertCount(cell.detected, cell.n, `class ${id}`);

    const tprLower = wilsonLower(cell.detected, cell.n);
    const passed = tprLower >= targets.tprLowerMin;

    if (!passed) {
      failures.push(
        `${id} TPR lower bound ${tprLower.toFixed(4)} is below ${targets.tprLowerMin}`,
      );
    }

    return { id, n: cell.n, detected: cell.detected, tprLower, passed };
  });

  return {
    accepted: failures.length === 0,
    confidence: targets.confidence,
    fprUpper,
    classes,
    failures,
  };
}
