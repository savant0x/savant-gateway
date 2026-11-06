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
import { packageOpenRouterArtifact } from "./packaging.ts";

/**
 * OpenRouter game artifacts (FID-2026-1104-013B).
 *
 * The observed source exposes a self-contained HTML document per model run.
 * The document is never executed on the server: it is validated as data, then
 * rendered only inside the existing opaque-origin viewer. The listing itself is
 * not scraped here; an operator supplies the exact record and document URLs, so
 * a page redesign cannot silently replace reviewed bytes.
 */

export const OPENROUTER_SOURCE_ID = "src_openrouter";
export const OPENROUTER_BASE_URL = "https://model-assets.openrouter.ai/";
export const OPENROUTER_REVISION = "operator-observed-2026-11-06";
const OPENROUTER_HOST = "model-assets.openrouter.ai";

export type OpenRouterRecord = {
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
  licenseSha256: string;
  artifactSha256: string | null;
  documentUrl: string;
  thumbnailUrl: string;
  documentPath: string | null;
  thumbnailPath: string | null;
  costUsdMicros: number | null;
  generationMs: number | null;
};

export type OpenRouterSnapshot = {
  source: VisualBuildSource;
  record: OpenRouterRecord;
  rawRecordJson: string;
  rawRecordSha256: string;
  promptText: string;
  promptSha256: string;
  artifactMime: "text/html; charset=utf-8";
  sourceUrl: string;
  artifactBytes: Uint8Array;
  artifactSha256: string;
  thumbnailBytes: Uint8Array | null;
  thumbnailSha256: string | null;
  licenseText: string;
  licenseSha256: string;
};

export class OpenRouterSourceError extends Error {}

function objectOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OpenRouterSourceError("The OpenRouter record is not an object.");
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OpenRouterSourceError(
      `The OpenRouter record is missing ${field}.`,
    );
  }

  return truncateText(value, max);
}

function optionalString(value: unknown, max: number): string {
  return typeof value === "string" ? truncateText(value, max) : "";
}

function requireHash(value: unknown, field: string): string {
  const hash = requireString(value, field, 64);

  if (!isSha256(hash)) {
    throw new OpenRouterSourceError(`The OpenRouter ${field} is not SHA-256.`);
  }

  return hash;
}

function assetUrl(value: unknown, field: string, suffix: string): string {
  const text = requireString(value, field, 2_048);
  let url: URL;

  try {
    url = new URL(text);
  } catch {
    throw new OpenRouterSourceError(`The OpenRouter ${field} is not a URL.`);
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== OPENROUTER_HOST ||
    !url.pathname.endsWith(suffix)
  ) {
    throw new OpenRouterSourceError(
      `The OpenRouter ${field} is outside the approved asset origin.`,
    );
  }

  return url.toString();
}

export function parseOpenRouterRecord(raw: string): OpenRouterRecord {
  if (Buffer.byteLength(raw, "utf8") > VISUAL_BUILD_LIMITS.manifestBytes) {
    throw new OpenRouterSourceError(
      "The OpenRouter record exceeds its ceiling.",
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OpenRouterSourceError("The OpenRouter record is not valid JSON.");
  }

  const record = objectOf(parsed);
  const model = objectOf(record.model);
  const id = requireString(record.id, "id", 100);

  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(id)) {
    throw new OpenRouterSourceError("The OpenRouter record id is not safe.");
  }

  const documentUrl = assetUrl(record.documentUrl, "documentUrl", ".html");
  const thumbnailUrl = assetUrl(record.thumbnailUrl, "thumbnailUrl", ".jpg");
  const documentPath = optionalString(record.documentPath, 500);
  const thumbnailPath = optionalString(record.thumbnailPath, 500);

  if (documentPath && !safeSourcePath(documentPath)) {
    throw new OpenRouterSourceError("The OpenRouter document path is unsafe.");
  }
  if (thumbnailPath && !safeSourcePath(thumbnailPath)) {
    throw new OpenRouterSourceError("The OpenRouter thumbnail path is unsafe.");
  }

  const artifactSha256 = optionalString(record.artifactSha256, 64);

  if (artifactSha256 && !isSha256(artifactSha256)) {
    throw new OpenRouterSourceError(
      "The OpenRouter artifact hash is not SHA-256.",
    );
  }

  const cost = nonNegativeNumber(record.costUsd);
  const generationMs = nonNegativeNumber(record.generationTimeMs);
  const threeVersion = optionalString(record.threeVersion, 40);
  const provider = requireString(record.provider, "provider", 200);
  const modelId = requireString(model.id, "model.id", 160);
  const modelName = requireString(model.name, "model.name", 200);

  return {
    externalId: id,
    title: requireString(record.title, "title", VISUAL_BUILD_LIMITS.labelChars),
    description: optionalString(
      record.description,
      VISUAL_BUILD_LIMITS.descriptionChars,
    ),
    originalModelId: modelId,
    originalModelLabel: modelName,
    creator: optionalString(model.author, 160) || provider,
    provider,
    task: optionalString(record.task, 80) || "games",
    effort: optionalString(record.effort, 80) || "unspecified",
    harness: threeVersion ? `three.js ${threeVersion}` : "unknown",
    sourceStatus: optionalString(record.sourceStatus, 80) || "unverified",
    validationState: optionalString(record.validationState, 80) || "unreviewed",
    sourceCreatedAt: isoDate(
      optionalString(record.sourceCreatedAt, 40) || null,
    ),
    promptSha256: requireHash(record.promptSha256, "promptSha256"),
    licenseSha256: requireHash(record.licenseSha256, "licenseSha256"),
    artifactSha256: artifactSha256 || null,
    documentUrl,
    thumbnailUrl,
    documentPath: documentPath || null,
    thumbnailPath: thumbnailPath || null,
    costUsdMicros: cost === null ? null : Math.round(cost * 1_000_000),
    generationMs: generationMs === null ? null : Math.round(generationMs),
  };
}

export function parseOpenRouterManifest(raw: string): OpenRouterRecord[] {
  if (Buffer.byteLength(raw, "utf8") > VISUAL_BUILD_LIMITS.manifestBytes) {
    throw new OpenRouterSourceError(
      "The OpenRouter manifest exceeds its ceiling.",
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OpenRouterSourceError(
      "The OpenRouter manifest is not valid JSON.",
    );
  }

  const entries = Array.isArray(parsed) ? parsed : objectOf(parsed).records;

  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 12) {
    throw new OpenRouterSourceError(
      "The OpenRouter manifest must contain 1–12 records.",
    );
  }

  const records = entries.map((entry) =>
    parseOpenRouterRecord(JSON.stringify(entry)),
  );
  const ids = new Set(records.map((record) => record.externalId));

  if (ids.size !== records.length) {
    throw new OpenRouterSourceError("The OpenRouter manifest repeats an id.");
  }

  return records;
}

function assertTextHash(
  text: string,
  expected: string,
  label: string,
  maxBytes: number,
): void {
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new OpenRouterSourceError(`${label} exceeds its byte ceiling.`);
  }
  if (sha256Hex(text) !== expected) {
    throw new OpenRouterSourceError(`${label} hash does not match the record.`);
  }
}

function assertThumbnail(bytes: Uint8Array | null): void {
  if (!bytes) return;
  if (bytes.byteLength > VISUAL_BUILD_LIMITS.thumbnailBytes) {
    throw new OpenRouterSourceError(
      "The OpenRouter thumbnail exceeds its byte ceiling.",
    );
  }
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  ) {
    throw new OpenRouterSourceError("The OpenRouter thumbnail is not a JPEG.");
  }
}

export function verifyOpenRouterFiles(
  source: VisualBuildSource,
  record: OpenRouterRecord,
  promptText: string,
  artifactBytes: Uint8Array,
  thumbnailBytes: Uint8Array | null,
  licenseText: string,
): OpenRouterSnapshot {
  if (source.kind !== "openrouter_artifacts") {
    throw new OpenRouterSourceError(
      "The OpenRouter snapshot belongs to a different source kind.",
    );
  }

  assertTextHash(
    promptText,
    record.promptSha256,
    "The OpenRouter prompt",
    VISUAL_BUILD_LIMITS.promptBytes,
  );
  assertTextHash(
    licenseText,
    record.licenseSha256,
    "The OpenRouter license",
    VISUAL_BUILD_LIMITS.licenseBytes,
  );
  assertThumbnail(thumbnailBytes);

  const html = new TextDecoder("utf-8", { fatal: true }).decode(artifactBytes);

  packageOpenRouterArtifact(html);

  const artifactSha256 = sha256Hex(artifactBytes);

  if (record.artifactSha256 && record.artifactSha256 !== artifactSha256) {
    throw new OpenRouterSourceError(
      "The OpenRouter artifact hash does not match the record.",
    );
  }

  return {
    source,
    record,
    rawRecordJson: JSON.stringify(record),
    rawRecordSha256: sha256Hex(JSON.stringify(record)),
    promptText,
    promptSha256: record.promptSha256,
    artifactMime: "text/html; charset=utf-8",
    sourceUrl: record.documentUrl,
    artifactBytes,
    artifactSha256,
    thumbnailBytes,
    thumbnailSha256: thumbnailBytes ? sha256Hex(thumbnailBytes) : null,
    licenseText,
    licenseSha256: record.licenseSha256,
  };
}
