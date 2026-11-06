import path from "node:path";

import {
  VISUAL_BUILD_LIMITS,
  isSha256,
  isoDate,
  nonNegativeNumber,
  safeSourcePath,
  sha256Hex,
  truncateText,
  type VisualBuildSource,
} from "./types.ts";
import { packagePelicanArtifact } from "./packaging.ts";

/**
 * Pelican record parsing and verification (FID-2026-1104-013A).
 *
 * The adapter trusts only the manifest, the canonical prompt and the record's
 * own hashes. It never executes the artifact on the server. A record may be
 * `unverified` at the source and still be retained for review; the separate
 * publication path is what refuses a missing rights or catalog decision.
 */

export type PelicanRecord = {
  externalId: string;
  title: string;
  description: string;
  originalModelId: string;
  originalModelLabel: string;
  creator: string;
  provider: string;
  task: string;
  effort: string;
  harness: string;
  sourceStatus: string;
  validationState: string;
  sourceCreatedAt: string | null;
  promptSha256: string;
  artifactSha256: string;
  artifactPath: string;
  costUsdMicros: number | null;
  generationMs: number | null;
};

export type PelicanSnapshot = {
  source: VisualBuildSource;
  manifestPath: string;
  resultPath: string;
  record: PelicanRecord;
  rawRecordJson: string;
  rawRecordSha256: string;
  promptText: string;
  promptSha256: string;
  artifactBytes: Uint8Array;
  artifactSha256: string;
  thumbnailBytes: Uint8Array | null;
  thumbnailSha256: string | null;
  licenseText: string;
  licenseSha256: string;
};

export const PELICAN_SOURCE_ID = "src_pelican";
export const PELICAN_COMMIT = "63190d7e5fb883175b8612374de5e7f094293548";
export const PELICAN_BASE_URL = `https://raw.githubusercontent.com/AzatJalilov/PelicanSdf/${PELICAN_COMMIT}/`;
export const PELICAN_RESULT_PATH = "results/gpt-6-1-sol-high-run-01.json";
export const PELICAN_LICENSE_TEXT = `MIT License

Copyright (c) 2026 Pelican SDF contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

export class PelicanSourceError extends Error {}

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PelicanSourceError(`Pelican record is missing ${field}.`);
  }

  return truncateText(value, max);
}

function optionalString(value: unknown, max: number): string {
  return typeof value === "string" ? truncateText(value, max) : "";
}

export function parsePelicanManifest(raw: string): string[] {
  if (Buffer.byteLength(raw, "utf8") > VISUAL_BUILD_LIMITS.manifestBytes) {
    throw new PelicanSourceError("Pelican manifest exceeds its byte ceiling.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PelicanSourceError("Pelican manifest is not valid JSON.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new PelicanSourceError("Pelican manifest has no entries.");
  }
  if (parsed.length > 500) {
    throw new PelicanSourceError("Pelican manifest has too many entries.");
  }

  const paths: string[] = [];
  const seen = new Set<string>();

  for (const entry of parsed) {
    if (
      typeof entry !== "string" ||
      !safeSourcePath(entry) ||
      !entry.startsWith("results/") ||
      !entry.endsWith(".json")
    ) {
      throw new PelicanSourceError("Pelican manifest contains an unsafe path.");
    }
    if (seen.has(entry)) {
      throw new PelicanSourceError(`Pelican manifest repeats ${entry}.`);
    }

    seen.add(entry);
    paths.push(entry);
  }

  return paths;
}

function artifactRelativePath(id: string): string {
  return `../artifacts/${id}.js`;
}

/** Resolves a record path against the source root, refusing anything else. */
export function resolvePelicanAssetPath(
  resultPath: string,
  relative: string,
  expectedId: string,
): string {
  if (relative !== artifactRelativePath(expectedId)) {
    throw new PelicanSourceError(
      `Pelican record ${expectedId} points at an unexpected artifact.`,
    );
  }

  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(resultPath), relative),
  );

  if (!safeSourcePath(resolved) || !resolved.startsWith("artifacts/")) {
    throw new PelicanSourceError("Pelican artifact path escapes the source.");
  }

  return resolved;
}

export function parsePelicanResult(
  raw: string,
  expectedPath: string,
): PelicanRecord {
  if (Buffer.byteLength(raw, "utf8") > VISUAL_BUILD_LIMITS.resultBytes) {
    throw new PelicanSourceError("Pelican result exceeds its byte ceiling.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PelicanSourceError("Pelican result is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PelicanSourceError("Pelican result is not an object.");
  }

  const record = parsed as Record<string, unknown>;
  const id = requireString(record.id, "id", 100);
  const expectedResultPath = `results/${id}.json`;

  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(id)) {
    throw new PelicanSourceError("Pelican result id is not safe.");
  }
  if (expectedPath !== expectedResultPath) {
    throw new PelicanSourceError(
      `Pelican manifest path ${expectedPath} does not match ${id}.`,
    );
  }

  const promptSha256 = requireString(record.promptSha256, "promptSha256", 64);
  const artifactSha256 = requireString(
    record.artifactSha256,
    "artifactSha256",
    64,
  );

  if (!isSha256(promptSha256) || !isSha256(artifactSha256)) {
    throw new PelicanSourceError("Pelican hashes are not SHA-256 hex.");
  }

  const model = requireString(record.model, "model", 160);
  const provider = requireString(record.provider, "provider", 200);
  const artifact = requireString(record.artifact, "artifact", 200);
  const usage =
    record.generationUsage && typeof record.generationUsage === "object"
      ? (record.generationUsage as Record<string, unknown>)
      : {};
  const metrics =
    record.metrics && typeof record.metrics === "object"
      ? (record.metrics as Record<string, unknown>)
      : {};
  const harness =
    record.generationHarness && typeof record.generationHarness === "object"
      ? (record.generationHarness as Record<string, unknown>)
      : {};
  const validation =
    record.validation && typeof record.validation === "object"
      ? (record.validation as Record<string, unknown>)
      : {};
  const provenance =
    record.provenance && typeof record.provenance === "object"
      ? (record.provenance as Record<string, unknown>)
      : {};
  const cost = nonNegativeNumber(usage.apiCostUsd);
  const initMs = nonNegativeNumber(metrics.initMs);
  const effortMatch = optionalString(provenance.decoding, 400).match(
    /reasoning effort:\s*([a-z0-9_-]+)/i,
  );
  const harnessName = optionalString(harness.name, 120);

  return {
    externalId: id,
    title: requireString(record.title, "title", VISUAL_BUILD_LIMITS.labelChars),
    description: optionalString(
      record.description,
      VISUAL_BUILD_LIMITS.descriptionChars,
    ),
    originalModelId: model,
    originalModelLabel: model,
    creator: provider.split(/\s+via\s+/i)[0].trim(),
    provider,
    task: optionalString(record.track, 80) || "unspecified",
    effort: effortMatch?.[1] ?? "unspecified",
    harness: harnessName
      ? `${harnessName} ${optionalString(harness.version, 40)}`.trim()
      : optionalString(provenance.generatorKind, 120) || "unknown",
    sourceStatus: optionalString(record.status, 80) || "unknown",
    validationState: optionalString(validation.state, 80) || "unreviewed",
    sourceCreatedAt: isoDate(optionalString(record.createdAt, 40) || null),
    promptSha256,
    artifactSha256,
    artifactPath: resolvePelicanAssetPath(expectedPath, artifact, id),
    costUsdMicros: cost === null ? null : Math.round(cost * 1_000_000),
    generationMs: initMs === null ? null : Math.round(initMs),
  };
}

export type PelicanVerifiedFiles = {
  record: PelicanRecord;
  rawRecordJson: string;
  rawRecordSha256: string;
  promptText: string;
  artifactBytes: Uint8Array;
  artifactSha256: string;
  thumbnailBytes: Uint8Array | null;
  thumbnailSha256: string | null;
  licenseText: string;
  licenseSha256: string;
};

function assertPrompt(prompt: string, expected: string): void {
  if (Buffer.byteLength(prompt, "utf8") > VISUAL_BUILD_LIMITS.promptBytes) {
    throw new PelicanSourceError("Pelican prompt exceeds its byte ceiling.");
  }
  if (sha256Hex(prompt) !== expected) {
    throw new PelicanSourceError(
      "Pelican prompt hash does not match the record.",
    );
  }
}

function assertArtifact(bytes: Uint8Array, expected: string): void {
  if (bytes.byteLength > VISUAL_BUILD_LIMITS.artifactBytes) {
    throw new PelicanSourceError("Pelican artifact exceeds its byte ceiling.");
  }

  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);

  if (!/^\s*export\s+function\s+createPelicanSdf\s*\(/m.test(text)) {
    throw new PelicanSourceError(
      "Pelican artifact does not export createPelicanSdf.",
    );
  }
  if (sha256Hex(bytes) !== expected) {
    throw new PelicanSourceError(
      "Pelican artifact hash does not match the record.",
    );
  }

  packagePelicanArtifact(text);
}

function assertThumbnail(bytes: Uint8Array | null): void {
  if (!bytes) return;
  if (bytes.byteLength > VISUAL_BUILD_LIMITS.thumbnailBytes) {
    throw new PelicanSourceError("Pelican thumbnail exceeds its byte ceiling.");
  }
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  ) {
    throw new PelicanSourceError("Pelican thumbnail is not a JPEG.");
  }
}

function assertLicense(text: string): void {
  if (Buffer.byteLength(text, "utf8") > VISUAL_BUILD_LIMITS.licenseBytes) {
    throw new PelicanSourceError("Pelican license exceeds its byte ceiling.");
  }
  if (!/MIT License/.test(text) || !/Permission is hereby granted/.test(text)) {
    throw new PelicanSourceError(
      "Pelican license is not the expected MIT text.",
    );
  }
}

export function verifyPelicanFiles(
  source: VisualBuildSource,
  resultPath: string,
  rawRecordJson: string,
  promptText: string,
  artifactBytes: Uint8Array,
  thumbnailBytes: Uint8Array | null,
  licenseText: string,
): PelicanVerifiedFiles {
  const record = parsePelicanResult(rawRecordJson, resultPath);

  assertPrompt(promptText, record.promptSha256);
  assertArtifact(artifactBytes, record.artifactSha256);
  assertThumbnail(thumbnailBytes);
  assertLicense(licenseText);

  const parsed = JSON.parse(rawRecordJson) as Record<string, unknown>;

  if (parsed.artifact !== artifactRelativePath(record.externalId)) {
    throw new PelicanSourceError(
      "Pelican record artifact path is not canonical.",
    );
  }

  return {
    record,
    rawRecordJson,
    rawRecordSha256: sha256Hex(rawRecordJson),
    promptText,
    artifactBytes,
    artifactSha256: record.artifactSha256,
    thumbnailBytes,
    thumbnailSha256: thumbnailBytes ? sha256Hex(thumbnailBytes) : null,
    licenseText,
    licenseSha256: sha256Hex(licenseText),
  };
}
