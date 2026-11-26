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

/**
 * The provider's own name is not part of a model's name. A payload that echoes
 * its path (`cc/claude-fable-5`) names no product, so it falls back to the leaf
 * title; a declared name that merely starts with the provider slug loses it.
 */
function publicName(providerSlug: string, model: NormalizedModel) {
  const declared = model.name.trim();
  const stripped = declared.startsWith(`${providerSlug}/`)
    ? declared.slice(providerSlug.length + 1)
    : declared;

  if (!stripped) return displayNameFromId(model.upstreamId);

  return stripped.includes("/") ? displayNameFromId(stripped) : stripped;
}

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
 * operator publishes it by setting a cost and activating it. There is no free
 * billing mode to exempt: every row is sold per token (FID-2026-1125-004).
 */
export function importedModelStatus(input: {
  costSource: "synced" | "unknown";
}): "active" | "disabled" {
  return input.costSource === "unknown" ? "disabled" : "active";
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
  // No row is free: a published cost is the only source of truth, and the
  // sell price is a markup on it (FID-2026-1125-004 step 2).
  const usd = side === "input" ? model.inputPer1M : resolveOutputPer1M(model);

  return usd === null ? 0 : Math.max(0, priceToMicros(usd));
}

function toRow(
  provider: ProviderRecord,
  defaultSlug: string | null,
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
    id: publicModelId(defaultSlug, provider.slug, model.upstreamId),
    upstreamId: model.upstreamId,
    upstreamSlug: provider.slug,
    routeGroup: canonicalModelKey(model.upstreamId),
    name: publicName(provider.slug, model),
    family: model.family,
    protocol,
    costSource: isPriced(model) ? "synced" : "unknown",
    contextWindow: model.contextWindow,
    // Weighted metering belonged to the previous upstream, which granted a
    // per-model allowance. This gateway has no such allocation, so every row
    // meters 1:1 and no upstream can set a 2x/3x multiplier (FID-2026-1125-004).
    tokenWeight: 1,
    costInputMicros: costMicros(model, "input"),
    costOutputMicros: costMicros(model, "output"),
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
  defaultSlug: string | null,
): {
  rows: SyncedModel[];
  skippedAliases: string[];
  skippedMedia: string[];
  skippedFreePool: string[];
} {
  const normalized = normalizeCatalog(models, metadata);
  const rows: Omit<SyncedModel, "sortOrder">[] = [];

  for (const model of normalized.models) {
    const row = toRow(provider, defaultSlug, model);

    if (row) rows.push(row);
  }

  rows.sort(
    (a, b) =>
      a.upstreamSlug.localeCompare(b.upstreamSlug) ||
      a.family.localeCompare(b.family) ||
      a.name.localeCompare(b.name),
  );

  return {
    rows: rows.map((row, index) => ({ ...row, sortOrder: (index + 1) * 10 })),
    skippedAliases: normalized.skippedAliases,
    skippedMedia: normalized.skippedMedia,
    skippedFreePool: normalized.skippedFreePool,
  };
}

export function buildSyncedModels(
  provider: ProviderRecord,
  models: UpstreamModel[],
  metadata: Map<string, ModelSpec>,
  defaultSlug: string | null,
): SyncedModel[] {
  return buildSyncedCatalog(provider, models, metadata, defaultSlug).rows;
}
