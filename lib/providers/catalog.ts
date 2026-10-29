import type { SyncedModel } from "../types";
import type { ProviderRecord, UpstreamModel } from "./types";

import { normalizeFamilyName } from "../model-family.ts";

import { inferModelProtocol, publicModelId } from "./registry.ts";

export type ModelSpec = UpstreamModel & {
  dollarsPer1M?: unknown;
  outputDollarsPer1M?: unknown;
  provider?: unknown;
  weight?: unknown;
  allowFree?: unknown;
  supported_endpoints?: unknown;
};

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
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
 * Builds one provider's catalog rows. Identity is scoped to the provider:
 * public ids are namespaced for non-default providers, and rows the provider
 * cannot serve over a supported protocol are excluded rather than failing at
 * call time. Only this provider's models are ever emitted, so one sync cannot
 * affect another provider's catalog.
 */
export function buildSyncedModels(
  provider: ProviderRecord,
  models: UpstreamModel[],
  metadata: Map<string, ModelSpec>,
): SyncedModel[] {
  const seen = new Set<string>();
  const rows: Omit<SyncedModel, "sortOrder">[] = [];

  for (const item of models) {
    const upstreamId = String(item.id ?? "").trim();

    if (!upstreamId || seen.has(upstreamId)) continue;
    seen.add(upstreamId);

    const spec = metadata.get(upstreamId) ?? item;
    const family = normalizeFamilyName(
      upstreamId,
      String(spec.provider ?? item.provider ?? ""),
    );
    const protocol = inferModelProtocol({
      kind: provider.kind,
      upstreamId,
      family,
      supportedEndpoints: item.supported_endpoints ?? spec.supported_endpoints,
    });

    if (!protocol) continue;

    const isFreePool =
      upstreamId.startsWith("free/") &&
      (typeof spec.allowFree === "boolean" ? spec.allowFree : true);
    const weight = isFreePool
      ? Math.max(1, Math.round(numberOrNull(spec.weight) ?? 1))
      : 0;
    const inputUsd = numberOrNull(spec.dollarsPer1M);
    const outputUsd = numberOrNull(spec.outputDollarsPer1M) ?? inputUsd;
    const priced = inputUsd !== null;

    rows.push({
      id: publicModelId(provider.slug, upstreamId),
      upstreamId,
      upstreamSlug: provider.slug,
      name:
        String(spec.name ?? item.name ?? "").trim() ||
        displayNameFromId(upstreamId),
      family,
      protocol,
      costSource: isFreePool || priced ? "synced" : "unknown",
      contextWindow:
        String(spec.context_window ?? item.context_window ?? "").trim() || "—",
      tokenWeight: weight,
      costInputMicros: isFreePool
        ? 0
        : Math.max(0, Math.round((inputUsd ?? 0) * 1_000_000)),
      costOutputMicros: isFreePool
        ? 0
        : Math.max(0, Math.round((outputUsd ?? 0) * 1_000_000)),
      allowFree: isFreePool,
      supportsTools: Boolean(spec.supportsTools),
      supportsVision: Boolean(spec.supportsVision),
      health: String(spec.health ?? "").trim() || null,
    });
  }

  rows.sort((a, b) => {
    if (a.allowFree !== b.allowFree) return a.allowFree ? -1 : 1;

    return (
      a.upstreamSlug.localeCompare(b.upstreamSlug) ||
      a.family.localeCompare(b.family) ||
      a.name.localeCompare(b.name)
    );
  });

  return rows.map((row, index) => ({ ...row, sortOrder: (index + 1) * 10 }));
}
