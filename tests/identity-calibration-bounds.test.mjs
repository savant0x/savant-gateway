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
import { BATTERY, FINGERPRINT_CELLS } from "../lib/identity/battery.ts";
import { canonicalJson } from "../lib/identity/protocol.ts";

const MANIFEST_HASH =
  "5ec520a2ec1c75e10f05b23144bf73caa3e609c1a6ed081d968de5badb6b9a83";
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
