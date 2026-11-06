import { createHash } from "node:crypto";

/**
 * Visual-build domain vocabulary (FID-2026-1104-013A).
 *
 * A build is a third-party artifact that renders a model's answer to the
 * canonical Pelican prompt. It is not a benchmark score: the source calls most
 * runs unverified and publishes no cross-model visual rubric here. Nothing in
 * this module may promote a build into routing, pricing or benchmark data.
 */

export type VisualBuildSourceKind = "pelican_sdf" | "openrouter_artifacts";

export type RightsState = "pending" | "approved" | "withdrawn";

export type VisualBuildVisibility = "pending" | "published" | "withdrawn";

export type BindingState = "pending" | "accepted" | "rejected";

export type BindingMethod = "exact_id" | "operator" | "suggested";

export type AliasState = "active" | "revoked";

export type ReviewDecision = "publish" | "withdraw" | "reject";

export type VisualBuildSource = {
  id: string;
  kind: VisualBuildSourceKind;
  label: string;
  baseUrl: string;
  revision: string;
  enabled: boolean;
  maxStorageBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type VisualBuildRights = {
  id: string;
  sourceId: string;
  state: RightsState;
  evidenceUrl: string;
  evidenceNote: string;
  evidenceSha256: string;
  licenseText: string;
  licenseSha256: string;
  attribution: string;
  displayAllowed: boolean;
  cacheAllowed: boolean;
  redistributeAllowed: boolean;
  reviewer: string;
  reviewedAt: string;
  supersededBy: string | null;
  createdAt: string;
};

/** A rights decision is usable only when every public-serving flag is set. */
export function rightsApproved(rights: VisualBuildRights | null): boolean {
  return (
    rights !== null &&
    rights.state === "approved" &&
    rights.displayAllowed &&
    rights.cacheAllowed &&
    rights.redistributeAllowed
  );
}

export type VisualBuildAsset = {
  id: string;
  sha256: string;
  mime: string;
  kind: "artifact" | "thumbnail";
  byteSize: number;
  createdAt: string;
};

export type VisualBuildBinding = {
  id: string;
  revisionId: string;
  modelId: string;
  state: BindingState;
  method: BindingMethod;
  reason: string;
  catalogDigest: string;
  reviewer: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type VisualBuildRevision = {
  id: string;
  buildId: string;
  revisionKey: string;
  sourceId: string;
  sourceUrl: string;
  sourceRevision: string;
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
  promptText: string;
  promptSha256: string;
  rawRecordJson: string;
  rawRecordSha256: string;
  costUsdMicros: number | null;
  generationMs: number | null;
  artifactAssetId: string;
  thumbnailAssetId: string | null;
  licenseText: string;
  licenseSha256: string;
  createdAt: string;
};

export type VisualBuildPublicRow = {
  buildId: string;
  revisionId: string;
  sourceId: string;
  sourceLabel: string;
  externalId: string;
  title: string;
  description: string;
  originalModelId: string;
  originalModelLabel: string;
  creator: string;
  effort: string;
  sourceStatus: string;
  validationState: string;
  sourceUrl: string;
  sourceCreatedAt: string | null;
  modelId: string;
  modelName: string;
  modelFamily: string;
  thumbnailSha256: string | null;
  artifactSha256: string;
  rightsAttribution: string;
  licenseText: string;
  publishedAt: string;
};

export type AdminVisualBuildRow = VisualBuildPublicRow & {
  visibility: VisualBuildVisibility;
  bindingState: BindingState;
  bindingMethod: BindingMethod;
  bindingReason: string;
  catalogDigestMatches: boolean;
  thumbnailAssetId: string | null;
  artifactAssetId: string;
  withdrawalNote: string | null;
};

export type VisualBuildImportResult = {
  seen: number;
  imported: number;
  skipped: number;
  errors: string[];
};

export const VISUAL_BUILD_LIMITS = {
  manifestBytes: 64 * 1024,
  resultBytes: 32 * 1024,
  promptBytes: 32 * 1024,
  licenseBytes: 64 * 1024,
  artifactBytes: 192 * 1024,
  thumbnailBytes: 96 * 1024,
  htmlBytes: 2 * 1024 * 1024,
  descriptionChars: 1_200,
  promptChars: 16_000,
  labelChars: 200,
  noteChars: 2_000,
  pageSize: 24,
  maxPageSize: 48,
  storageBytes: 64 * 1024 * 1024,
} as const;

export function visualBuildsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.VISUAL_BUILDS_ENABLED?.trim().toLowerCase() === "true";
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export function truncateText(value: string, max: number): string {
  const trimmed = value.trim();

  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/**
 * Paths in a manifest are relative to the source root. Reject absolute paths,
 * traversal, empty segments and backslashes before they reach a URL join.
 */
export function safeSourcePath(value: string): boolean {
  if (!value || value.length > 500) return false;
  if (value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
    return false;
  }

  const parts = value.split("/");

  return parts.every(
    (part) => part.length > 0 && part !== "." && part !== "..",
  );
}

export function isoDate(value: string | null): string | null {
  if (!value) return null;

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export type CatalogModelForShowcase = {
  id: string;
  upstreamId: string;
  name: string;
  family: string;
  inCatalog: boolean;
  status: string;
};

export function catalogIdentityDigest(
  model: CatalogModelForShowcase | null,
): string {
  return sha256Hex(
    JSON.stringify(
      model
        ? {
            id: model.id,
            upstreamId: model.upstreamId,
            name: model.name,
            family: model.family,
            inCatalog: model.inCatalog,
            status: model.status,
          }
        : null,
    ),
  );
}
