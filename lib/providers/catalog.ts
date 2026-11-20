import type { SyncedModel } from "../types";
import type { ProviderRecord, UpstreamModel } from "./types";
import type { NormalizedModel } from "./normalize/types.ts";

import { priceToMicros } from "../pricing.ts";
import { canonicalModelKey } from "../model-identity.ts";

import { inferModelProtocol, publicModelId } from "./registry.ts";
import { normalizeCatalog } from "./normalize/index.ts";

export type ModelSpec = UpstreamModel & {
  dollarsPer1M?: unknown;
  outputDollarsPer1M?: unknown;
  provider?: unknown;
  weight?: unknown;
  allowFree?: unknown;
  supported_endpoints?: unknown;
};

function displayNameFromId(modelId: string) {
  const leaf = modelId.includes("/")
    ? modelId.slice(modelId.lastIndexOf("/") + 1)
    : modelId;

  return leaf
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * The status a newly imported row starts with. A row the upstream did not
 * price cannot be sold, so it must not appear in the public catalog at $0.00
 * while every call would answer `model_unpriced`. It imports disabled and the
 * operator publishes it by setting a cost and activating it. Free-pool rows
 * are priced by definition and stay active.
 */
export function importedModelStatus(input: {
  costSource: "synced" | "unknown";
  isFree: boolean;
}): "active" | "disabled" {
  return input.costSource === "unknown" && !input.isFree
    ? "disabled"
    : "active";
}

/**
 * A published output rate of zero is a missing figure, not a free one: no
 * upstream sells completion tokens for nothing, and accepting it billed output
 * at $0. Fall back to the input rate and let the operator override. A malformed
 * figure still makes the row unknown; only an absent or zero figure falls back.
 */
function resolveOutputPer1M(model: NormalizedModel) {
  if (model.outputPer1M === null || model.outputPer1M === 0) {
    return model.inputPer1M;
  }

  return model.outputPer1M;
}

function isPriced(model: NormalizedModel) {
  return model.inputPer1M !== null && resolveOutputPer1M(model) !== null;
}

function costMicros(model: NormalizedModel, side: "input" | "output") {
  if (model.freePool) return 0;

  const usd = side === "input" ? model.inputPer1M : resolveOutputPer1M(model);

  return usd === null ? 0 : Math.max(0, priceToMicros(usd));
}

function toRow(
  provider: ProviderRecord,
  model: NormalizedModel,
): Omit<SyncedModel, "sortOrder"> | null {
  const protocol = inferModelProtocol({
    kind: provider.kind,
    upstreamId: model.upstreamId,
    family: model.family,
    supportedEndpoints: model.supportedEndpoints,
  });

  if (!protocol) return null;

  return {
    id: publicModelId(provider.slug, model.upstreamId),
    upstreamId: model.upstreamId,
    upstreamSlug: provider.slug,
    routeGroup: canonicalModelKey(model.upstreamId),
    name: model.name.trim() || displayNameFromId(model.upstreamId),
    family: model.family,
    protocol,
    costSource: model.freePool || isPriced(model) ? "synced" : "unknown",
    contextWindow: model.contextWindow,
    tokenWeight: model.tokenWeight,
    costInputMicros: costMicros(model, "input"),
    costOutputMicros: costMicros(model, "output"),
    allowFree: model.freePool,
    supportsTools: model.supportsTools,
    supportsVision: model.supportsVision,
    health: model.health,
  };
}

/**
 * Builds one provider's catalog rows. Identity is scoped to the provider:
 * public ids are namespaced for non-default providers, and rows the provider
 * cannot serve over a supported protocol are excluded rather than failing at
 * call time. Only this provider's models are ever emitted, so one sync cannot
 * affect another provider's catalog.
 *
 * The vendor vocabulary is read in `normalize/`; this builder only assembles.
 */
export function buildSyncedCatalog(
  provider: ProviderRecord,
  models: UpstreamModel[],
  metadata: Map<string, ModelSpec>,
): {
  rows: SyncedModel[];
  skippedAliases: string[];
  skippedMedia: string[];
} {
  const normalized = normalizeCatalog(models, metadata);
  const rows: Omit<SyncedModel, "sortOrder">[] = [];

  for (const model of normalized.models) {
    const row = toRow(provider, model);

    if (row) rows.push(row);
  }

  rows.sort((a, b) => {
    if (a.allowFree !== b.allowFree) return a.allowFree ? -1 : 1;

    return (
      a.upstreamSlug.localeCompare(b.upstreamSlug) ||
      a.family.localeCompare(b.family) ||
      a.name.localeCompare(b.name)
    );
  });

  return {
    rows: rows.map((row, index) => ({ ...row, sortOrder: (index + 1) * 10 })),
    skippedAliases: normalized.skippedAliases,
    skippedMedia: normalized.skippedMedia,
  };
}

export function buildSyncedModels(
  provider: ProviderRecord,
  models: UpstreamModel[],
  metadata: Map<string, ModelSpec>,
): SyncedModel[] {
  return buildSyncedCatalog(provider, models, metadata).rows;
}
