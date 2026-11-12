/**
 * Pre-registration arithmetic for the identity calibration lab
 * (FID-2026-1110-002, step 1).
 *
 * The power proof is the answer to "can this sample size support the claim?".
 * It is computed from the same predicate the certificate uses, so a manifest
 * cannot declare a sample size that the bounds cannot defend.
 */

import { CONTROL_REQUESTS, REQUEST_COUNTS } from "../battery.ts";

import {
  DEFAULT_TARGETS,
  evaluateAcceptance,
  wilsonLower,
  zeroEventUpperBound,
  type CalibrationCounts,
  type ClassCounts,
  type ClassId,
} from "./bounds.ts";

export const RPM_DEFAULT = 10;
export const RPM_CEILING = 60;

/**
 * Smallest n with a 95% Wilson lower bound at n/n meeting `tprMin`. With zero
 * misses this is 35 for 0.90; 34/34 is 0.8985.
 */
export function minimumPositivesForTpr(
  tprMin: number = DEFAULT_TARGETS.tprLowerMin,
) {
  if (!(tprMin > 0 && tprMin < 1)) {
    throw new RangeError(
      "minimumPositivesForTpr: tprMin must be inside (0, 1).",
    );
  }

  for (let n = 1; n <= 100_000; n += 1) {
    if (wilsonLower(n, n) >= tprMin) return n;
  }

  throw new Error("minimumPositivesForTpr: no n <= 100000 reaches the target.");
}

/**
 * Smallest n whose exact 95% zero-event upper bound is at most `fprMax`.
 * This is 299 for 0.01 and 35 for 0.082.
 */
export function minimumControlsForFpr(
  fprMax: number = DEFAULT_TARGETS.fprUpperMax,
) {
  if (!(fprMax > 0 && fprMax < 1)) {
    throw new RangeError(
      "minimumControlsForFpr: fprMax must be inside (0, 1).",
    );
  }

  for (let n = 1; n <= 1_000_000; n += 1) {
    if (zeroEventUpperBound(n) <= fprMax) return n;
  }

  throw new Error("minimumControlsForFpr: no n <= 1000000 reaches the target.");
}

export type RequestBreakdown = Record<ClassId | "controls", number>;

export type PowerProof = {
  confidence: number;
  positives: { required: number; achieved: number; tprLower: number };
  controls: { required: number; achieved: number; fprUpper: number };
  requestBreakdown: RequestBreakdown;
  requests: number;
  hoursAtDefaultRpm: number;
  hoursAtCeilingRpm: number;
  accepted: boolean;
  failures: string[];
};

/** The all-pass matrix that the manifest's sample sizes must reproduce. */
export function provePower(): PowerProof {
  const positives = minimumPositivesForTpr();
  const controls = minimumControlsForFpr();

  const counts: CalibrationCounts = {
    controls: { n: controls, falsePositives: 0 },
    positives: {
      substitution: { n: positives, detected: positives },
      version_swap: { n: positives, detected: positives },
      hidden_prompt: { n: positives, detected: positives },
      context_truncation: { n: positives, detected: positives },
      phantom_tool: { n: positives, detected: positives },
    } satisfies Record<ClassId, ClassCounts>,
  };
  const acceptance = evaluateAcceptance(counts);

  const requestBreakdown: RequestBreakdown = {
    substitution: positives * CONTROL_REQUESTS,
    version_swap: positives * CONTROL_REQUESTS,
    hidden_prompt: positives * REQUEST_COUNTS.canary,
    context_truncation: positives * REQUEST_COUNTS.context,
    phantom_tool: positives * REQUEST_COUNTS.tools,
    controls: controls * CONTROL_REQUESTS,
  };
  const requests = Object.values(requestBreakdown).reduce(
    (total, count) => total + count,
    0,
  );

  return {
    confidence: acceptance.confidence,
    positives: {
      required: positives,
      achieved: positives,
      tprLower: wilsonLower(positives, positives),
    },
    controls: {
      required: controls,
      achieved: controls,
      fprUpper: zeroEventUpperBound(controls),
    },
    requestBreakdown,
    requests,
    hoursAtDefaultRpm: requests / (RPM_DEFAULT * 60),
    hoursAtCeilingRpm: requests / (RPM_CEILING * 60),
    accepted: acceptance.accepted,
    failures: acceptance.failures,
  };
}
