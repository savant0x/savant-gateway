import assert from "node:assert/strict";
import test from "node:test";

import {
  CLASS_IDS,
  evaluateAcceptance,
  ruleOfThree,
  wilsonLower,
  zeroEventUpperBound,
} from "../lib/identity/calibration/bounds.ts";
import {
  minimumControlsForFpr,
  minimumPositivesForTpr,
  provePower,
  RPM_CEILING,
  RPM_DEFAULT,
} from "../lib/identity/calibration/power.ts";
import {
  CALIBRATION_MANIFEST,
  CALIBRATION_MANIFEST_SHA256,
  CALIBRATION_POWER,
  buildCalibrationProtocol,
  calibrationManifestHash,
  verifyCalibrationManifest,
  verifyCalibrationProtocol,
} from "../lib/identity/calibration/manifest.ts";
import {
  BATTERY,
  FINGERPRINT_CELLS,
  FINGERPRINT_SAMPLES,
  SMOOTHING,
} from "../lib/identity/battery.ts";
import {
  DEFAULT_DELTA_SIMULATION,
  DESIGN_REFERENCE,
  DESIGN_REFERENCE_ID,
  calibrateDelta,
  smallestDelta,
  verifyFrozenDelta,
} from "../lib/identity/calibration/delta.ts";
import { canonicalJson } from "../lib/identity/protocol.ts";
import {
  DEFAULT_ALPHA_CELL,
  DEFAULT_DELTA,
  DEFAULT_EPROCESS,
  DEFAULT_LAMBDA,
  OTHER_CATEGORY,
  OTHER_FLOOR_CAP,
  buildPrevisible,
  buildReference,
  cellAlpha,
  goodTuringOtherFloor,
  isRejected,
  previsibleMass,
  referenceMass,
  runEProcess,
  updateLogWealth,
  verdictRejects,
  wealthFactor,
  wealthThreshold,
} from "../lib/identity/stats/betting.ts";

const MANIFEST_HASH =
  "bdd152ba2db5bb1bafe702a531f660f014517782011f21ec927d7b00dafdc9ba";
const SEALED_AT = "2026-11-11T00:00:00.000Z";

function close(actual, expected, epsilon = 5e-5) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

function allPassCounts() {
  return {
    controls: { n: 299, falsePositives: 0 },
    positives: {
      substitution: { n: 35, detected: 35 },
      version_swap: { n: 35, detected: 35 },
      hidden_prompt: { n: 35, detected: 35 },
      context_truncation: { n: 35, detected: 35 },
      phantom_tool: { n: 35, detected: 35 },
    },
  };
}

test("Wilson lower bound reproduces the published 20/20, 35/35 and 45/45", () => {
  close(wilsonLower(20, 20), 0.8389);
  close(wilsonLower(35, 35), 0.9011);
  close(wilsonLower(45, 45), 0.9213);
  assert.ok(wilsonLower(34, 34) < 0.9);
  assert.ok(wilsonLower(35, 35) >= 0.9);
  assert.equal(wilsonLower(0, 0), 0);
});

test("zero-event upper bound reproduces 0/299 and 0/35", () => {
  close(zeroEventUpperBound(299), 0.00997, 1e-5);
  close(zeroEventUpperBound(35), 0.082);
  assert.equal(zeroEventUpperBound(0), 1);
  close(ruleOfThree(299), 0.01003);
  assert.equal(ruleOfThree(0), 1);
});

test("the proven minimums are 35 positives and 299 controls", () => {
  assert.equal(minimumPositivesForTpr(), 35);
  assert.equal(minimumControlsForFpr(), 299);
  assert.ok(zeroEventUpperBound(298) > 0.01);
  assert.ok(zeroEventUpperBound(299) <= 0.01);
});

test("acceptance requires all five classes at 35/35 and 0/299", () => {
  const accepted = evaluateAcceptance(allPassCounts());

  assert.equal(accepted.accepted, true);
  assert.deepEqual(accepted.failures, []);
  assert.equal(accepted.fprUpper <= 0.01, true);
  assert.equal(accepted.classes.length, CLASS_IDS.length);
  assert.deepEqual(
    accepted.classes.map((entry) => entry.id),
    [...CLASS_IDS],
  );

  const missed = allPassCounts();

  missed.positives.substitution = { n: 35, detected: 34 };
  assert.equal(evaluateAcceptance(missed).accepted, false);

  const falsePositive = allPassCounts();

  falsePositive.controls = { n: 299, falsePositives: 1 };
  assert.equal(evaluateAcceptance(falsePositive).accepted, false);

  const tooFewControls = allPassCounts();

  tooFewControls.controls = { n: 298, falsePositives: 0 };
  assert.equal(evaluateAcceptance(tooFewControls).accepted, false);
});

test("a missing class or an impossible count is refused, not passed", () => {
  const missing = allPassCounts();

  delete missing.positives.phantom_tool;

  assert.throws(() => evaluateAcceptance(missing), /missing class/);
  assert.throws(
    () =>
      evaluateAcceptance({
        ...allPassCounts(),
        controls: { n: 10, falsePositives: 11 },
      }),
    RangeError,
  );
});

test("the power proof is the 44,910-request matrix", () => {
  const proof = provePower();

  assert.equal(proof.accepted, true);
  assert.equal(proof.positives.required, 35);
  assert.equal(proof.controls.required, 299);
  assert.deepEqual(proof.requestBreakdown, {
    substitution: 4_200,
    version_swap: 4_200,
    hidden_prompt: 210,
    context_truncation: 210,
    phantom_tool: 210,
    controls: 35_880,
  });
  assert.equal(proof.requests, 44_910);
  close(proof.hoursAtDefaultRpm, 74.85, 1e-6);
  close(proof.hoursAtCeilingRpm, 12.475, 1e-6);
  assert.equal(RPM_DEFAULT, 10);
  assert.equal(RPM_CEILING, 60);
});

test("the manifest is frozen to the recorded hash and proven minimums", () => {
  assert.equal(CALIBRATION_MANIFEST.protocol.candidateId, "aio-identity-v3");
  assert.equal(CALIBRATION_MANIFEST.protocol.version, "3");
  assert.equal(CALIBRATION_MANIFEST.protocol.batteryId, BATTERY.id);
  assert.equal(CALIBRATION_MANIFEST.protocol.batteryUnchanged, true);
  assert.equal(CALIBRATION_MANIFEST.acceptance.positivesPerClass, 35);
  assert.equal(CALIBRATION_MANIFEST.acceptance.controls, 299);
  assert.equal(CALIBRATION_MANIFEST.arms.controls.comparisons, 299);
  assert.equal(CALIBRATION_MANIFEST.eprocess.cellCount, FINGERPRINT_CELLS.length);
  assert.equal(
    Math.ceil(1 / CALIBRATION_MANIFEST.eprocess.alphaCell),
    CALIBRATION_MANIFEST.eprocess.wealthThreshold,
  );
  assert.ok(
    Math.abs(
      CALIBRATION_MANIFEST.eprocess.alphaCell *
        CALIBRATION_MANIFEST.eprocess.cellCount -
        CALIBRATION_MANIFEST.eprocess.alphaVerdict,
    ) < 1e-12,
  );
  assert.equal(
    CALIBRATION_MANIFEST.holdout.cellOrder.join(","),
    FINGERPRINT_CELLS.map((cell) => cell.id).join(","),
  );
  assert.equal(CALIBRATION_MANIFEST_SHA256, MANIFEST_HASH);
  assert.equal(calibrationManifestHash(CALIBRATION_MANIFEST), MANIFEST_HASH);
  assert.equal(CALIBRATION_MANIFEST_SHA256.length, 64);
  assert.equal(CALIBRATION_POWER.accepted, true);
  assert.deepEqual(verifyCalibrationManifest(CALIBRATION_MANIFEST), {
    ok: true,
  });
});

test("a mutated or absent manifest is refused", () => {
  const changed = {
    ...CALIBRATION_MANIFEST,
    acceptance: {
      ...CALIBRATION_MANIFEST.acceptance,
      positivesPerClass: 34,
    },
  };

  assert.deepEqual(verifyCalibrationManifest(changed), {
    ok: false,
    reason: "manifest changed",
  });
  assert.deepEqual(verifyCalibrationManifest(null), {
    ok: false,
    reason: "manifest changed",
  });
});

test("the v3 seal covers the manifest and the unchanged battery", () => {
  const record = buildCalibrationProtocol(SEALED_AT);

  assert.equal(record.id, "aio-identity-v3");
  assert.equal(record.version, "3");
  assert.equal(record.batteryJson, canonicalJson(BATTERY));
  assert.deepEqual(verifyCalibrationProtocol(record), { ok: true });
  assert.notEqual(
    buildCalibrationProtocol("2026-11-12T00:00:00.000Z").probeSha256,
    record.probeSha256,
  );
  assert.deepEqual(
    verifyCalibrationProtocol({ ...record, probeSha256: "0".repeat(64) }),
    { ok: false, reason: "protocol seal changed" },
  );
  assert.deepEqual(
    verifyCalibrationProtocol({ ...record, id: "aio-identity-v2" }),
    { ok: false, reason: "protocol id changed" },
  );
  assert.deepEqual(
    verifyCalibrationProtocol({ ...record, batteryJson: "{}" }),
    { ok: false, reason: "battery changed" },
  );
});

test("a record sealed against a different manifest is refused", () => {
  const shifted = {
    ...CALIBRATION_MANIFEST,
    acceptance: { ...CALIBRATION_MANIFEST.acceptance, controls: 300 },
  };
  const shiftedRecord = buildCalibrationProtocol(SEALED_AT, shifted);

  assert.deepEqual(verifyCalibrationProtocol(shiftedRecord, shifted), {
    ok: true,
  });
  assert.deepEqual(verifyCalibrationProtocol(shiftedRecord), {
    ok: false,
    reason: "protocol seal changed",
  });
});

test("the per-cell threshold is 1/alpha and composes to the verdict budget", () => {
  assert.equal(wealthThreshold(0.01 / 6), 600);
  assert.equal(wealthThreshold(0.01), 100);
  assert.equal(cellAlpha(0.01, 6), 0.01 / 6);
  assert.equal(cellAlpha(0.01, 6) * 6, 0.01);
  assert.equal(DEFAULT_ALPHA_CELL, CALIBRATION_MANIFEST.eprocess.alphaCell);
  assert.equal(wealthThreshold(DEFAULT_ALPHA_CELL), 600);
  assert.equal(DEFAULT_LAMBDA, CALIBRATION_MANIFEST.eprocess.lambda);
  assert.equal(DEFAULT_DELTA, CALIBRATION_MANIFEST.eprocess.delta);
  assert.equal(DEFAULT_EPROCESS.smoothing, SMOOTHING);
  assert.throws(() => wealthThreshold(0), RangeError);
  assert.throws(() => wealthThreshold(1.5), RangeError);
  assert.throws(() => cellAlpha(0.01, 0), RangeError);
});

test("an empty stream reports unit wealth and never rejects", () => {
  const result = runEProcess([], { a: 10, b: 6, c: 3, d: 1 });

  assert.equal(result.rejected, false);
  assert.equal(result.rejectedAt, null);
  assert.equal(result.steps, 0);
  assert.equal(result.logWealth, 0);
  assert.equal(result.wealth, 1);
  assert.equal(result.threshold, 600);
});

test("the Good-Turing floor keeps every unseen answer reachable", () => {
  assert.equal(goodTuringOtherFloor({}), 1);
  assert.equal(goodTuringOtherFloor({ a: 1, b: 1 }), OTHER_FLOOR_CAP);
  assert.equal(goodTuringOtherFloor({ a: 10, b: 6, c: 3, d: 1 }), 1 / 20);
  assert.equal(goodTuringOtherFloor({ a: 5 }), SMOOTHING);
  assert.equal(goodTuringOtherFloor({ a: 1, b: 3 }), 1 / 4);

  const reference = buildReference({ a: 5 });

  assert.ok(referenceMass(reference, "a") > 0);
  assert.equal(referenceMass(reference, "never-seen"), reference.other);
  close(reference.observedMass + reference.other, 1, 1e-12);
  assert.equal(referenceMass(reference, "never-seen"), SMOOTHING);
});

test("the reference and the previsible estimate are distributions", () => {
  const counts = { a: 10, b: 6, c: 3, d: 1 };
  const reference = buildReference(counts);
  const estimate = buildPrevisible({ a: 4, b: 2, unknown: 1 }, reference);

  const referenceTotal =
    reference.categories.reduce(
      (total, category) => total + referenceMass(reference, category),
      0,
    ) + reference.other;
  const estimateTotal =
    reference.categories.reduce(
      (total, category) => total + previsibleMass(estimate, category),
      0,
    ) + estimate.other;

  close(referenceTotal, 1, 1e-12);
  close(estimateTotal, 1, 1e-12);
  assert.equal(previsibleMass(estimate, "unknown"), estimate.other);
  assert.equal(previsibleMass(estimate, "never-seen"), estimate.other);
  assert.ok(previsibleMass(estimate, "a") > previsibleMass(estimate, "d"));
});

test("the Kelly factor is fair under the reference distribution", () => {
  const counts = { a: 10, b: 6, c: 3, d: 1 };
  const reference = buildReference(counts);
  const estimate = buildPrevisible({ a: 4, b: 2 }, reference);

  const expected =
    reference.categories.reduce(
      (total, category) =>
        total +
        referenceMass(reference, category) *
          wealthFactor(reference, estimate, category, DEFAULT_LAMBDA),
      0,
    ) +
    reference.other *
      wealthFactor(reference, estimate, OTHER_CATEGORY, DEFAULT_LAMBDA);

  // The drift is subtracted outside the factor, so the factor itself is fair.
  close(expected, 1, 1e-12);
  assert.ok(expected <= 1 + 1e-9);
  assert.throws(() => wealthFactor(reference, estimate, "a", 0), RangeError);
});

test("a route answering off the reference rejects early", () => {
  const result = runEProcess(
    Array.from({ length: 10 }, () => "phantom-answer"),
    { a: 18, b: 2 },
  );

  assert.equal(result.rejected, true);
  assert.equal(result.rejectedAt, 1);
  assert.equal(result.steps, 1);
  assert.ok(result.wealth >= result.threshold);
});

test("an honest stream and an all-same stream stay under the threshold", () => {
  const counts = { a: 10, b: 6, c: 3, d: 1 };
  const reference = buildReference(counts);
  const draws = [];
  let seed = 2_026_1112;

  // Draw from the reference itself: this is the H0 route.
  for (let index = 0; index < 20; index += 1) {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;

    const target = seed / 4_294_967_296;
    let cumulative = 0;
    let picked = OTHER_CATEGORY;

    for (const category of reference.categories) {
      cumulative += referenceMass(reference, category);

      if (target <= cumulative) {
        picked = category;
        break;
      }
    }

    draws.push(picked);
  }

  const honest = runEProcess(draws, counts);
  const identical = runEProcess(
    Array.from({ length: 20 }, () => "a"),
    { a: 30 },
  );

  assert.equal(honest.rejected, false);
  assert.equal(honest.rejectedAt, null);
  assert.equal(honest.steps, 20);
  assert.equal(identical.rejected, false);
  assert.ok(identical.wealth < 1);
});

test("wealth exactly at the threshold rejects, one epsilon below does not", () => {
  const threshold = wealthThreshold(DEFAULT_ALPHA_CELL);

  assert.equal(isRejected(Math.log(threshold)), true);
  assert.equal(isRejected(Math.log(threshold) - 1e-9), false);
  assert.equal(isRejected(0), false);
  assert.equal(verdictRejects([]), false);
  assert.equal(
    verdictRejects([
      runEProcess([], { a: 1 }),
      runEProcess(["out-of-reference"], { a: 18, b: 2 }),
    ]),
    true,
  );
});

test("an invalid configuration or count is refused, not run", () => {
  assert.throws(
    () => runEProcess(["a"], { a: 1 }, { ...DEFAULT_EPROCESS, alpha: 0 }),
    RangeError,
  );
  assert.throws(
    () => runEProcess(["a"], { a: 1 }, { ...DEFAULT_EPROCESS, lambda: 2 }),
    RangeError,
  );
  assert.throws(
    () => runEProcess(["a"], { a: 1 }, { ...DEFAULT_EPROCESS, delta: -1 }),
    RangeError,
  );
  assert.throws(
    () =>
      runEProcess(["a"], { a: 1 }, { ...DEFAULT_EPROCESS, smoothing: 0 }),
    RangeError,
  );
  assert.throws(() => runEProcess(["a"], { a: -1 }), RangeError);
  assert.throws(
    () =>
      updateLogWealth({
        logWealth: 0,
        prior: { a: Number.NaN },
        category: "a",
        reference: buildReference({ a: 1 }),
        config: DEFAULT_EPROCESS,
      }),
    RangeError,
  );
});

test("the frozen delta is the simulation's output, not a chosen constant", () => {
  const receipt = calibrateDelta();

  assert.equal(receipt.cells, FINGERPRINT_CELLS.length);
  assert.equal(receipt.streams, FINGERPRINT_CELLS.length * 256);
  assert.equal(receipt.config.horizon, FINGERPRINT_SAMPLES);
  assert.equal(receipt.bound, 300);
  assert.equal(receipt.delta, CALIBRATION_MANIFEST.eprocess.delta);
  assert.equal(receipt.delta, DEFAULT_DELTA);
  assert.equal(receipt.rawDelta, CALIBRATION_MANIFEST.eprocess.deltaRaw);
  assert.equal(receipt.clampedTo, null);
  assert.equal(receipt.withinBound, true);
  assert.ok(receipt.delta >= DEFAULT_DELTA_SIMULATION.floor);
  assert.ok(receipt.delta <= DEFAULT_DELTA_SIMULATION.ceiling);
  assert.equal(
    CALIBRATION_MANIFEST.eprocess.deltaStatus,
    "frozen_step_3_simulation",
  );
  assert.deepEqual(
    CALIBRATION_MANIFEST.eprocess.deltaSimulation,
    DEFAULT_DELTA_SIMULATION,
  );
  assert.deepEqual(verifyFrozenDelta(CALIBRATION_MANIFEST), { ok: true });
});

test("the recorded seed reproduces the delta exactly", () => {
  const first = calibrateDelta();
  const second = calibrateDelta();

  assert.equal(first.rawDelta, second.rawDelta);
  assert.equal(first.delta, second.delta);
  assert.equal(first.streams, second.streams);
});

test("a stricter bound raises the drift and a looser one lowers it", () => {
  const base = calibrateDelta();
  const stricter = calibrateDelta(DESIGN_REFERENCE, {
    ...DEFAULT_DELTA_SIMULATION,
    margin: 4,
  });
  const looser = calibrateDelta(DESIGN_REFERENCE, {
    ...DEFAULT_DELTA_SIMULATION,
    margin: 1,
  });

  assert.ok(stricter.rawDelta > base.rawDelta);
  assert.ok(looser.rawDelta < base.rawDelta);
  assert.ok(stricter.delta > base.delta);
  assert.ok(looser.delta < base.delta);
});

test("the smallest feasible drift solves the linear constraint", () => {
  const bound = Math.log(300);

  assert.equal(smallestDelta([], bound), 0);
  assert.equal(smallestDelta([1, 2, 3], bound), 0);
  close(smallestDelta([1, 2, 9], bound), (9 - bound) / 3, 1e-12);
  close(smallestDelta([-1, 40], bound), (40 - bound) / 2, 1e-12);
});

test("the design reference is the declared shape on every cell", () => {
  assert.equal(DESIGN_REFERENCE_ID, DEFAULT_DELTA_SIMULATION.designReferenceId);
  assert.equal(
    DEFAULT_DELTA_SIMULATION.alpha,
    CALIBRATION_MANIFEST.eprocess.alphaCell,
  );
  assert.equal(Object.keys(DESIGN_REFERENCE).length, FINGERPRINT_CELLS.length);

  for (const cell of FINGERPRINT_CELLS) {
    const counts = DESIGN_REFERENCE[cell.id];

    assert.ok(counts, `missing design counts for ${cell.id}`);
    assert.equal(Object.keys(counts).length, 8);
    assert.equal(
      Object.values(counts).reduce((total, count) => total + count, 0),
      200,
    );
  }
});

test("a hand-edited delta or simulation input is refused", () => {
  const manifest = CALIBRATION_MANIFEST;
  const editedDelta = {
    ...manifest,
    eprocess: { ...manifest.eprocess, delta: 0.05 },
  };
  const editedSeed = {
    ...manifest,
    eprocess: {
      ...manifest.eprocess,
      deltaSimulation: { ...DEFAULT_DELTA_SIMULATION, seed: 1 },
    },
  };
  const editedStatus = {
    ...manifest,
    eprocess: {
      ...manifest.eprocess,
      deltaStatus: "provisional_until_step_3_simulation",
    },
  };

  assert.deepEqual(verifyFrozenDelta(editedDelta), {
    ok: false,
    reason: "delta does not match the simulation",
  });
  assert.deepEqual(verifyFrozenDelta(editedSeed), {
    ok: false,
    reason: "delta simulation inputs changed",
  });
  assert.deepEqual(verifyFrozenDelta(editedStatus), {
    ok: false,
    reason: "delta is not frozen by the simulation",
  });
  assert.deepEqual(verifyCalibrationManifest(editedSeed), {
    ok: false,
    reason: "manifest changed",
  });
});

test("an invalid simulation or empty reference is refused, not run", () => {
  const run = (patch) =>
    calibrateDelta(DESIGN_REFERENCE, { ...DEFAULT_DELTA_SIMULATION, ...patch });

  assert.throws(() => run({ horizon: 0 }), RangeError);
  assert.throws(() => run({ simulations: 1.5 }), RangeError);
  assert.throws(() => run({ drift: 1 }), RangeError);
  assert.throws(() => run({ margin: 0 }), RangeError);
  assert.throws(() => run({ multiplier: 0.5 }), RangeError);
  assert.throws(() => run({ floor: 0.6 }), RangeError);
  assert.throws(() => calibrateDelta({}), RangeError);
  assert.throws(() => calibrateDelta({ empty: {} }), RangeError);
});
