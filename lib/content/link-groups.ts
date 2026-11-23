import type { ModelSummary } from "../types.ts";
import type { ContentRelation } from "./types.ts";

import { canonicalModelKey } from "../model-identity.ts";

/**
 * One card per underlying model (FID-2026-1123-001).
 *
 * A link points at a provider-scoped catalog row, so the same weights sold by
 * eight providers produced eight price cards for one headline. Grouping is done
 * at read time from `canonicalModelKey`, which keeps `content.model_links` exact
 * — the audit table still records the row that matched, and a provider that is
 * later disabled simply stops being the representative.
 *
 * A group whose catalog rows are all gone is kept, not dropped: the piece really
 * did discuss that model, and the reader is told it is not sold here rather than
 * shown a shorter list that silently lost evidence.
 */
export type LinkEvidence = {
  modelId: string;
  relation: ContentRelation;
  reason: string;
};

export type LinkedModelGroup = {
  /** Provider-neutral identity, shared by every row of the same weights. */
  key: string;
  /** The row this card quotes: the cheapest resolved one, else the first. */
  modelId: string;
  model: ModelSummary | null;
  relation: ContentRelation;
  reason: string;
  /** Every other catalog row in the group, in link order. */
  providers: string[];
};

function priceKey(model: ModelSummary): number {
  const input = Number.isFinite(model.inputPricePer1M)
    ? model.inputPricePer1M
    : 0;
  const output = Number.isFinite(model.outputPricePer1M)
    ? model.outputPricePer1M
    : 0;

  return input + output;
}

export function groupLinkedModels(
  links: LinkEvidence[],
  modelsById: Map<string, ModelSummary>,
): LinkedModelGroup[] {
  const groups = new Map<string, LinkedModelGroup>();

  for (const link of links) {
    const model = modelsById.get(link.modelId) ?? null;
    const key = canonicalModelKey(model?.upstreamId ?? link.modelId);
    const group = groups.get(key);

    if (!group) {
      groups.set(key, {
        key,
        modelId: link.modelId,
        model,
        relation: link.relation,
        reason: link.reason,
        providers: [],
      });

      continue;
    }

    group.providers.push(link.modelId);

    if (model && (!group.model || priceKey(model) < priceKey(group.model))) {
      // The cheapest row becomes the quoted one; the previous representative is
      // still a provider of the same model, so it moves into the list rather
      // than losing its place in the evidence.
      group.providers = group.providers.filter((id) => id !== link.modelId);
      group.providers.unshift(group.modelId);

      group.modelId = link.modelId;
      group.model = model;
      group.relation = link.relation;
      group.reason = link.reason;
    }
  }

  return Array.from(groups.values());
}
