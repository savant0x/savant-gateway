/**
 * The frozen `aio-identity-v3` calibration manifest
 * (FID-2026-1110-002, step 1).
 *
 * This is a candidate, not the live protocol. `PROTOCOL_ID` stays
 * `aio-identity-v2` until step 7 wires certificate consumption; no probe may be
 * collected against this candidate before its hash is recorded.
 *
 * The manifest freezes the acceptance rule, sample sizes, held-out split,
 * e-process constants and the list of constants the certificate must supply.
 * It deliberately does not carry `consistentMultiplier`,
 * `divergentMultiplier` or `controlMultiplier` as sealed values: those are the
 * measured outputs, not inputs.
 */

import type { IdentityProtocolRecord } from "../types.ts";

import {
  BATTERY,
  CONTROL_REQUESTS,
  FINGERPRINT_CELLS,
  NORMALIZER_VERSION,
  REQUEST_COUNTS,
  SAMPLING,
  SYSTEM_PROMPT,
} from "../battery.ts";
import {
  buildProtocolRecord,
  canonicalJson,
  sha256Hex,
  type ProtocolCheck,
} from "../protocol.ts";

import {
  minimumControlsForFpr,
  minimumPositivesForTpr,
  provePower,
} from "./power.ts";

const FROZEN_ON = "2026-11-11";
const POSITIVES_PER_CLASS = 35;
const CONTROL_COMPARISONS = 299;

export const CALIBRATION_MANIFEST = {
  schema: 1,
  frozenOn: FROZEN_ON,
  protocol: {
    candidateId: "aio-identity-v3",
    version: "3",
    detectorVersion: "jsd-eprocess-v1",
    normalizerVersion: NORMALIZER_VERSION,
    batteryId: BATTERY.id,
    batteryVersion: BATTERY.version,
    batteryUnchanged: true,
  },
  arms: {
    controls: {
      id: "control",
      comparisons: CONTROL_COMPARISONS,
      requestsPerComparison: CONTROL_REQUESTS,
    },
    classes: [
      {
        id: "substitution",
        detector: "fingerprint",
        requestsPerPositive: CONTROL_REQUESTS,
        positives: POSITIVES_PER_CLASS,
      },
      {
        id: "version_swap",
        detector: "fingerprint",
        requestsPerPositive: CONTROL_REQUESTS,
        positives: POSITIVES_PER_CLASS,
      },
      {
        id: "hidden_prompt",
        detector: "canary",
        requestsPerPositive: REQUEST_COUNTS.canary,
        positives: POSITIVES_PER_CLASS,
      },
      {
        id: "context_truncation",
        detector: "context_ladder",
        requestsPerPositive: REQUEST_COUNTS.context,
        positives: POSITIVES_PER_CLASS,
      },
      {
        id: "phantom_tool",
        detector: "tool_conformance",
        requestsPerPositive: REQUEST_COUNTS.tools,
        positives: POSITIVES_PER_CLASS,
      },
    ],
    excluded: [
      {
        id: "quantization",
        state: "not_tested",
        reason:
          "No ground-truth deployment or logprob reference exists for most routes.",
      },
      {
        id: "weight_authenticity",
        state: "not_claimed",
        reason: "A black-box battery cannot establish weight provenance.",
      },
      {
        id: "non_separable_version_pair",
        state: "not_separable",
        reason:
          "A pair that does not separate at the pre-registered power is recorded, never passed.",
      },
    ],
  },
  holdout: {
    designSetId: "calibration-design-v1",
    reportedSetId: "calibration-heldout-v1",
    disjoint: true,
    paraphraseSeed: 2_026_1111,
    cellOrder: FINGERPRINT_CELLS.map((cell) => cell.id),
  },
  eprocess: {
    alphaVerdict: 0.01,
    cellCount: FINGERPRINT_CELLS.length,
    alphaCell: 0.01 / FINGERPRINT_CELLS.length,
    lambda: 0.5,
    delta: 0.05,
    deltaStatus: "provisional_until_step_3_simulation",
    wealthThreshold: 600,
    controlPercentile: 0.05,
  },
  decision: {
    minSamplesPerCell: 10,
    minComparableCells: 4,
    noiseFloor: 0.01,
    ttlDays: 7,
    certificateValidityDays: 90,
    certificateSupplied: [
      "consistentMultiplier",
      "divergentMultiplier",
      "controlMultiplier",
    ],
  },
  acceptance: {
    confidence: 0.95,
    fprUpperMax: 0.01,
    tprLowerMin: 0.9,
    requireZeroControlFalsePositives: true,
    positivesPerClass: POSITIVES_PER_CLASS,
    controls: CONTROL_COMPARISONS,
  },
} as const;

export type CalibrationManifest = typeof CALIBRATION_MANIFEST;

export const CALIBRATION_POWER = provePower();

export function calibrationManifestHash(manifest: CalibrationManifest) {
  return sha256Hex(canonicalJson(manifest));
}

export const CALIBRATION_MANIFEST_SHA256 =
  calibrationManifestHash(CALIBRATION_MANIFEST);

export type ManifestCheck = { ok: true } | { ok: false; reason: string };

/**
 * Recomputes the seal and every arithmetic invariant. A manifest that merely
 * parses is not accepted; it must be the frozen object and its sample sizes
 * must be the proven minimums.
 */
export function verifyCalibrationManifest(value: unknown): ManifestCheck {
  if (canonicalJson(value) !== canonicalJson(CALIBRATION_MANIFEST)) {
    return { ok: false, reason: "manifest changed" };
  }

  const manifest = value as CalibrationManifest;

  if (calibrationManifestHash(manifest) !== CALIBRATION_MANIFEST_SHA256) {
    return { ok: false, reason: "manifest hash changed" };
  }

  if (
    manifest.protocol.candidateId !== "aio-identity-v3" ||
    manifest.protocol.version !== "3"
  ) {
    return { ok: false, reason: "protocol candidate changed" };
  }

  if (
    manifest.protocol.batteryId !== BATTERY.id ||
    manifest.protocol.batteryVersion !== BATTERY.version ||
    manifest.protocol.batteryUnchanged !== true
  ) {
    return { ok: false, reason: "battery declaration changed" };
  }

  if (
    manifest.acceptance.positivesPerClass !== minimumPositivesForTpr() ||
    manifest.acceptance.controls !== minimumControlsForFpr()
  ) {
    return { ok: false, reason: "sample size is below the proven minimum" };
  }

  if (manifest.arms.controls.comparisons !== manifest.acceptance.controls) {
    return { ok: false, reason: "control arm and acceptance disagree" };
  }

  for (const arm of manifest.arms.classes) {
    if (arm.positives !== manifest.acceptance.positivesPerClass) {
      return { ok: false, reason: `class ${arm.id} sample size disagrees` };
    }
  }

  if (!CALIBRATION_POWER.accepted) {
    return { ok: false, reason: "power proof failed" };
  }

  if (
    Math.abs(
      manifest.eprocess.alphaCell * manifest.eprocess.cellCount -
        manifest.eprocess.alphaVerdict,
    ) > 1e-12
  ) {
    return { ok: false, reason: "alpha split does not compose" };
  }

  if (
    Math.ceil(1 / manifest.eprocess.alphaCell) !==
    manifest.eprocess.wealthThreshold
  ) {
    return { ok: false, reason: "wealth threshold does not match alpha" };
  }

  if (
    manifest.holdout.cellOrder.join(",") !==
    FINGERPRINT_CELLS.map((cell) => cell.id).join(",")
  ) {
    return { ok: false, reason: "cell order changed" };
  }

  return { ok: true };
}

/** The exact object covered by the v3 protocol seal. */
export function calibrationSeal(
  sealedAt: string,
  manifest: CalibrationManifest = CALIBRATION_MANIFEST,
) {
  return {
    protocolId: manifest.protocol.candidateId,
    battery: BATTERY,
    calibrationManifestSha256: calibrationManifestHash(manifest),
    eprocess: manifest.eprocess,
    decision: manifest.decision,
    acceptance: manifest.acceptance,
    holdout: manifest.holdout,
    sealedAt,
  };
}

export function buildCalibrationProtocol(
  sealedAt: string,
  manifest: CalibrationManifest = CALIBRATION_MANIFEST,
): IdentityProtocolRecord {
  return buildProtocolRecord({
    id: manifest.protocol.candidateId,
    version: manifest.protocol.version,
    seal: calibrationSeal(sealedAt, manifest),
    sealedAt,
  });
}

export function verifyCalibrationProtocol(
  record: IdentityProtocolRecord,
  manifest: CalibrationManifest = CALIBRATION_MANIFEST,
): ProtocolCheck {
  if (record.id !== manifest.protocol.candidateId) {
    return { ok: false, reason: "protocol id changed" };
  }

  if (record.version !== manifest.protocol.version) {
    return { ok: false, reason: "protocol version changed" };
  }

  if (record.batteryJson !== canonicalJson(BATTERY)) {
    return { ok: false, reason: "battery changed" };
  }

  if (record.samplingJson !== canonicalJson(SAMPLING)) {
    return { ok: false, reason: "sampling changed" };
  }

  if (record.normalizerVersion !== NORMALIZER_VERSION) {
    return { ok: false, reason: "normalizer changed" };
  }

  if (record.systemPromptSha256 !== sha256Hex(SYSTEM_PROMPT)) {
    return { ok: false, reason: "system prompt changed" };
  }

  if (
    record.probeSha256 !==
    buildCalibrationProtocol(record.sealedAt, manifest).probeSha256
  ) {
    return { ok: false, reason: "protocol seal changed" };
  }

  return { ok: true };
}
