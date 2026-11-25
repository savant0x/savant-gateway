/**
 * The one place that turns a provider's own catalog vocabulary into ours.
 *
 * A primary shape is chosen by declared precedence, every matching enrichment
 * shape is merged on top (the overlay wins, as `metadata.get(id) ?? item` did),
 * and the result is resolved into `NormalizedModel`. Nothing downstream reads a
 * vendor field name again.
 */
import type { UpstreamModel } from "../types.ts";
import type {
  NormalizedModel,
  NormalizeOptions,
  NormalizeResult,
  RawEntry,
  RawFacts,
} from "./types.ts";

import { normalizeFamilyName } from "../../model-family.ts";

import { asText, recordOf } from "./facts.ts";
import { emptyFacts, mergeFacts } from "./types.ts";
import { ENRICHMENT_SHAPES, LABEL_SHAPES, PRIMARY_SHAPES } from "./shapes.ts";

/** Output modalities that cannot be served as a chat completion. */
const NON_CHAT_OUTPUTS = new Set(["image", "audio", "video", "embedding"]);

function mergeShapes(
  facts: RawFacts,
  entry: RawEntry,
  shapes: typeof PRIMARY_SHAPES,
) {
  let merged = facts;

  for (const shape of shapes) {
    if (!shape.matches(entry)) continue;

    merged = mergeFacts(merged, shape.read(entry));
  }

  return merged;
}

/** Primary shape first, then every enrichment shape, overlay last. */
export function readFacts(entry: RawEntry, overlay: RawEntry | null): RawFacts {
  const primary = PRIMARY_SHAPES.find((shape) => shape.matches(entry));

  let facts = primary
    ? mergeFacts(emptyFacts(), primary.read(entry))
    : emptyFacts();

  facts = mergeShapes(facts, entry, ENRICHMENT_SHAPES);

  if (overlay) facts = mergeShapes(facts, overlay, ENRICHMENT_SHAPES);

  return facts;
}

function priceSourceOf(facts: RawFacts): NormalizedModel["priceSource"] {
  if (facts.freePool) return "free-pool";

  return facts.inputPer1M !== null && facts.outputPer1M !== null
    ? "declared"
    : "absent";
}

/** True when the upstream declares an output modality that is not text. */
function outputsNonText(facts: RawFacts) {
  return (facts.outputModalities ?? []).some((modality) =>
    NON_CHAT_OUTPUTS.has(modality),
  );
}

/** A declared image input is vision support when the flag itself is absent. */
function declaresVision(facts: RawFacts) {
  if (facts.supportsVision !== null) return facts.supportsVision;

  return (facts.inputModalities ?? []).includes("image");
}

function toModel(entry: RawEntry, facts: RawFacts): NormalizedModel {
  const upstreamId = asText(entry.id);

  return {
    upstreamId,
    name: facts.name,
    family: normalizeFamilyName(upstreamId, facts.familyLabel),
    contextWindow: facts.contextWindow || "—",
    inputPer1M: facts.inputPer1M,
    outputPer1M: facts.outputPer1M,
    priceSource: priceSourceOf(facts),
    freePool: facts.freePool,
    supportsTools: facts.supportsTools ?? false,
    supportsVision: declaresVision(facts),
    supportedEndpoints: facts.supportedEndpoints,
    health: facts.health,
  };
}

function isAliasEntry(entry: RawEntry) {
  return LABEL_SHAPES.some((shape) => shape.matches(entry));
}

/**
 * Normalizes one provider's catalog page.
 *
 * Two classes are dropped and reported rather than imported: an **alias** shares
 * its route key with the provider-pinned rows while naming no provider, and a
 * **non-text output** row cannot be served by a chat gateway. Unpriced text rows
 * are kept — dropping one would discard an operator's manual cost on the next
 * sync.
 *
 * A third class is conditional: a `free/` row is refused outright when the
 * operator records that the provider's terms forbid reselling its free-pool
 * allocation (`resaleFreePool: false`). The default is `true`, so a provider
 * whose terms are silent keeps today's behaviour.
 */
export function normalizeCatalog(
  entries: UpstreamModel[],
  overlay: Map<string, UpstreamModel> = new Map(),
  options: NormalizeOptions = { resaleFreePool: true },
): NormalizeResult {
  const seen = new Set<string>();
  const models: NormalizedModel[] = [];
  const skippedAliases: string[] = [];
  const skippedMedia: string[] = [];
  const skippedFreePool: string[] = [];

  for (const raw of entries) {
    const entry = recordOf(raw);

    if (!entry) continue;

    const upstreamId = asText(entry.id);

    if (!upstreamId || seen.has(upstreamId)) continue;
    seen.add(upstreamId);

    if (isAliasEntry(entry)) {
      skippedAliases.push(upstreamId);
      continue;
    }

    const overlayEntry = recordOf(overlay.get(upstreamId)) ?? null;
    const facts = readFacts(entry, overlayEntry);

    if (facts.freePool && !options.resaleFreePool) {
      skippedFreePool.push(upstreamId);
      continue;
    }

    if (outputsNonText(facts)) {
      skippedMedia.push(upstreamId);
      continue;
    }

    models.push(toModel(entry, facts));
  }

  return { models, skippedAliases, skippedMedia, skippedFreePool };
}
