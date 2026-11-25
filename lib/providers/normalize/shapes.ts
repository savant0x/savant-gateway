/**
 * The declared shapes an upstream catalog can arrive in.
 *
 * Detection is by **content**: a shape matches because a field is present, not
 * because the provider has a particular slug. That is what lets a new provider
 * be a table entry plus a fixture instead of a branch in the shared builder.
 *
 * Precedence is declared here once, in `PRIMARY_SHAPES` order. Where a provider
 * publishes a figure in two places, the enrichment overlay wins, which is what
 * the pre-normalization builder did with `metadata.get(id) ?? item`.
 */
import type { CatalogShape, RawEntry } from "./types.ts";

import { asBool, asModalities, asNumber, asText, recordOf } from "./facts.ts";

/**
 * Flat USD-per-1M facts: the default provider's public overlay, and any
 * provider that declares prices directly in its `/models` envelope.
 */
function flatFacts(entry: RawEntry) {
  return {
    inputPer1M: asNumber(entry.dollarsPer1M),
    outputPer1M: asNumber(entry.outputDollarsPer1M),
    familyLabel: asText(entry.provider ?? entry.family),
    supportsTools: asBool(entry.supportsTools),
    supportsVision: asBool(entry.supportsVision),
    health: asText(entry.health) || null,
    contextWindow: asText(entry.contextWindow ?? entry.context_window),
    name: asText(entry.name),
    supportedEndpoints: entry.supported_endpoints,
  };
}

function hasFlatPrice(entry: RawEntry) {
  return (
    entry.dollarsPer1M !== undefined || entry.outputDollarsPer1M !== undefined
  );
}

/**
 * An ask ladder: a nested `pricing` object whose cheapest open ask is the cost.
 * The official rate is deliberately not used — it is the list price, not what a
 * call is charged at once a bid is set.
 */
function askLadderFacts(entry: RawEntry) {
  const pricing = recordOf(entry.pricing) ?? {};

  return {
    inputPer1M: asNumber(pricing.min_ask_in),
    outputPer1M: asNumber(pricing.min_ask_out),
    contextWindow: asText(entry.input_token_limit),
    name: asText(entry.upstream_label ?? entry.name),
    supportedEndpoints: entry.supported_endpoints,
  };
}

/**
 * A declared modality list. It is its own fact source so a row with no price at
 * all still tells us it outputs images instead of text.
 */
function modalityFacts(entry: RawEntry) {
  return {
    inputModalities: asModalities(entry.modality),
    outputModalities: asModalities(entry.output_modality),
  };
}

function declaresModalities(entry: RawEntry) {
  return entry.modality !== undefined || entry.output_modality !== undefined;
}

function hasAskLadder(entry: RawEntry) {
  const pricing = recordOf(entry.pricing);

  if (!pricing) return false;

  return (
    asNumber(pricing.min_ask_in) !== null ||
    asNumber(pricing.min_ask_out) !== null
  );
}

/** A `free/` allocation or an explicit `allowFree` flag on an id. */
function freePoolFacts(entry: RawEntry) {
  const id = asText(entry.id);
  const allowFree = asBool(entry.allowFree);
  const freePrefix = id.startsWith("free/");

  return {
    freePool: freePrefix ? allowFree !== false : allowFree === true,
  };
}

function declaresFreePool(entry: RawEntry) {
  return asText(entry.id).startsWith("free/") || entry.allowFree !== undefined;
}

/** A row the provider routes across its own providers: no price, no pin. */
function isAlias(entry: RawEntry) {
  return asText(entry.owned_by).toLowerCase() === "alias";
}

export const PRIMARY_SHAPES: CatalogShape[] = [
  {
    name: "ask-ladder",
    role: "primary",
    matches: hasAskLadder,
    read: askLadderFacts,
  },
  {
    name: "free-pool",
    role: "primary",
    matches: declaresFreePool,
    read: freePoolFacts,
  },
  {
    name: "flat-usd",
    role: "primary",
    matches: hasFlatPrice,
    read: flatFacts,
  },
];

export const ENRICHMENT_SHAPES: CatalogShape[] = [
  {
    name: "declared-modalities",
    role: "enrichment",
    matches: declaresModalities,
    read: modalityFacts,
  },
  {
    name: "public-overlay",
    role: "enrichment",
    matches: hasFlatPrice,
    read: flatFacts,
  },
  {
    name: "declared-allowance",
    role: "enrichment",
    matches: declaresFreePool,
    read: freePoolFacts,
  },
];

export const LABEL_SHAPES: CatalogShape[] = [
  {
    name: "alias",
    role: "label",
    matches: isAlias,
    read: () => ({}),
  },
];
