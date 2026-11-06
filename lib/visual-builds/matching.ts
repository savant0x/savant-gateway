import { normalizeModelKey } from "../benchmarks.ts";

import {
  type CatalogModelForShowcase,
  type VisualBuildBinding,
} from "./types.ts";

/**
 * Precise artifact-to-model matching (FID-2026-1104-013A).
 *
 * Accepted identity comes from an exact source model id or an operator alias.
 * A display-name hit is only a suggestion for a human; it never becomes a
 * publication binding. Run ids (`-high-run-01`, `-xhigh-run-02`) are not model
 * identity and are never stripped.
 */

export type ShowcaseAlias = {
  externalModelId: string;
  modelId: string;
};

export type VisualMatchState =
  "matched" | "ambiguous" | "suggestion" | "unmatched";

export type VisualModelMatch = {
  state: VisualMatchState;
  modelId: string | null;
  candidateIds: string[];
  method: "exact_id" | "operator_alias" | "name_suggestion" | null;
  reason: string;
};

function exactKey(value: string): string {
  return normalizeModelKey(value, { preserveFreePrefix: true });
}

function modelKeys(model: CatalogModelForShowcase): string[] {
  return [model.id, model.upstreamId]
    .map(exactKey)
    .filter((key): key is string => key.length > 0);
}

function indexByKey(
  models: CatalogModelForShowcase[],
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  for (const model of models) {
    for (const key of modelKeys(model)) {
      const ids = index.get(key) ?? new Set<string>();

      ids.add(model.id);
      index.set(key, ids);
    }
  }

  return index;
}

function catalogModel(
  models: CatalogModelForShowcase[],
  modelId: string,
): CatalogModelForShowcase | null {
  return models.find((model) => model.id === modelId) ?? null;
}

function visible(model: CatalogModelForShowcase): boolean {
  return model.inCatalog && model.status === "active";
}

export function matchVisualBuild(input: {
  originalModelId: string;
  originalModelLabel?: string;
  models: CatalogModelForShowcase[];
  aliases?: ShowcaseAlias[];
}): VisualModelMatch {
  const sourceId = input.originalModelId.trim();
  const sourceKey = exactKey(sourceId);
  const visibleModels = input.models.filter(visible);

  if (!sourceKey) {
    return {
      state: "unmatched",
      modelId: null,
      candidateIds: [],
      method: null,
      reason: "The source record has no model id.",
    };
  }

  const alias = (input.aliases ?? []).find(
    (row) => exactKey(row.externalModelId) === sourceKey,
  );

  if (alias) {
    const target = catalogModel(visibleModels, alias.modelId);

    return target
      ? {
          state: "matched",
          modelId: target.id,
          candidateIds: [target.id],
          method: "operator_alias",
          reason: `Operator alias maps ${sourceId} to ${target.id}.`,
        }
      : {
          state: "unmatched",
          modelId: null,
          candidateIds: [],
          method: null,
          reason: `Alias target ${alias.modelId} is not an active catalog model.`,
        };
  }

  const indexed = indexByKey(visibleModels).get(sourceKey);
  const exactHits = indexed ? Array.from(indexed) : [];

  if (exactHits.length === 1) {
    return {
      state: "matched",
      modelId: exactHits[0],
      candidateIds: exactHits,
      method: "exact_id",
      reason: `Exact normalized id ${sourceKey}.`,
    };
  }

  if (exactHits.length > 1) {
    return {
      state: "ambiguous",
      modelId: null,
      candidateIds: exactHits.sort(),
      method: null,
      reason: `Normalized id ${sourceKey} belongs to ${exactHits.length} catalog models.`,
    };
  }

  const labelKey = exactKey(input.originalModelLabel ?? "");
  const suggestions = labelKey
    ? visibleModels
        .filter(
          (model) =>
            exactKey(model.name) === labelKey ||
            exactKey(model.upstreamId) === labelKey,
        )
        .map((model) => model.id)
        .sort()
    : [];

  if (suggestions.length === 1) {
    return {
      state: "suggestion",
      modelId: null,
      candidateIds: suggestions,
      method: "name_suggestion",
      reason: `Display name matches ${suggestions[0]}, but no exact id does; operator review is required.`,
    };
  }

  if (suggestions.length > 1) {
    return {
      state: "ambiguous",
      modelId: null,
      candidateIds: suggestions,
      method: null,
      reason: `Display name matches ${suggestions.length} catalog models.`,
    };
  }

  return {
    state: "unmatched",
    modelId: null,
    candidateIds: [],
    method: null,
    reason: `No exact catalog id matches ${sourceId}.`,
  };
}

/**
 * Refuses to publish when an accepted binding's stored catalog digest no longer
 * describes the live model. Renames, delisting and family moves all invalidate.
 */
export function bindingStillValid(
  binding: VisualBuildBinding,
  liveModel: CatalogModelForShowcase | null,
  currentDigest: string,
): { ok: boolean; reason: string } {
  if (binding.state !== "accepted") {
    return { ok: false, reason: "The model binding is not accepted." };
  }
  if (!liveModel) {
    return { ok: false, reason: "The bound model no longer exists." };
  }
  if (!visible(liveModel)) {
    return {
      ok: false,
      reason: "The bound model is not active in the catalog.",
    };
  }
  if (binding.catalogDigest !== currentDigest) {
    return {
      ok: false,
      reason: "The catalog identity changed after this binding was reviewed.",
    };
  }

  return { ok: true, reason: "Binding matches the live catalog identity." };
}
