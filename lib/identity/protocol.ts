import type { IdentityCounts, IdentityProtocolRecord } from "./types.ts";

import { createHash } from "node:crypto";

import {
  BATTERY,
  BOOTSTRAP_DRAWS,
  BOOTSTRAP_SEED,
  DECISION,
  NORMALIZER_VERSION,
  PROTOCOL_ID,
  PROTOCOL_VERSION,
  SAMPLING,
  SMOOTHING,
  SPLIT_HALF_DRAWS,
  SPLIT_HALF_SEED,
  SYSTEM_PROMPT,
} from "./battery.ts";

/** JSON with keys sorted recursively, so equal objects hash equally. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);

  return `{${entries.join(",")}}`;
}

export function sha256Hex(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

/** The exact object covered by the protocol seal. */
export function protocolSeal(sealedAt: string) {
  return {
    battery: BATTERY,
    systemPrompt: SYSTEM_PROMPT,
    sampling: SAMPLING,
    normalizerVersion: NORMALIZER_VERSION,
    smoothing: SMOOTHING,
    splitHalf: { seed: SPLIT_HALF_SEED, draws: SPLIT_HALF_DRAWS },
    bootstrap: { seed: BOOTSTRAP_SEED, draws: BOOTSTRAP_DRAWS },
    decision: DECISION,
    sealedAt,
  };
}

export function buildProtocol(sealedAt: string): IdentityProtocolRecord {
  const batteryJson = canonicalJson(BATTERY);

  return {
    id: PROTOCOL_ID,
    version: PROTOCOL_VERSION,
    probeSha256: sha256Hex(canonicalJson(protocolSeal(sealedAt))),
    systemPromptSha256: sha256Hex(SYSTEM_PROMPT),
    batteryJson,
    samplingJson: canonicalJson(SAMPLING),
    normalizerVersion: NORMALIZER_VERSION,
    sealedAt,
  };
}

export type ProtocolCheck = { ok: true } | { ok: false; reason: string };

export function verifyProtocol(record: IdentityProtocolRecord): ProtocolCheck {
  if (record.id !== PROTOCOL_ID) {
    return { ok: false, reason: "protocol id changed" };
  }

  if (record.version !== PROTOCOL_VERSION) {
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

  if (record.probeSha256 !== buildProtocol(record.sealedAt).probeSha256) {
    return { ok: false, reason: "protocol seal changed" };
  }

  return { ok: true };
}

export type ReferenceHashInput = {
  canonicalModelKey: string;
  protocolId: string;
  providerSlug: string;
  upstreamId: string;
  collectedAt: string;
  nPerCell: number;
  counts: IdentityCounts;
};

/** Covers the reference's identity and its counts, not only the counts. */
export function referenceContentHash(input: ReferenceHashInput) {
  return sha256Hex(canonicalJson(input));
}
