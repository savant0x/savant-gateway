/**
 * The canonical row every upstream catalog is normalized into.
 *
 * Nothing in this file knows a provider's name. A provider's vocabulary is
 * mapped onto these fields by the shapes in `shapes.ts`, so the builder that
 * produces `SyncedModel` rows only ever reads canonical fields and never
 * guesses a field name.
 */

/** Provider-level facts as declared, before precedence and fallbacks. */
export type RawFacts = {
  inputPer1M: number | null;
  outputPer1M: number | null;
  freePool: boolean;
  /** A declared family label (`provider` on a flat shape). Never a group word. */
  familyLabel: string;
  /** `null` means the upstream did not declare the capability. */
  supportsTools: boolean | null;
  supportsVision: boolean | null;
  health: string | null;
  contextWindow: string;
  name: string;
  /** `null` means the upstream did not declare output modalities. */
  outputModalities: string[] | null;
  inputModalities: string[] | null;
  supportedEndpoints: unknown;
};

/** One price-bearing model, provider-neutral. */
export type NormalizedModel = {
  upstreamId: string;
  name: string;
  family: string;
  contextWindow: string;
  /** USD per 1M tokens, or `null` when the upstream declared no figure. */
  inputPer1M: number | null;
  outputPer1M: number | null;
  priceSource: "declared" | "free-pool" | "absent";
  freePool: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportedEndpoints: unknown;
  health: string | null;
};

/** A vendor payload shape, detected by content and never by provider slug. */
export type CatalogShape = {
  name: string;
  /** `primary` shapes are candidates for one row; `enrichment` merges on top. */
  role: "primary" | "enrichment" | "label";
  matches(entry: RawEntry): boolean;
  read(entry: RawEntry): Partial<RawFacts>;
};

export type RawEntry = Record<string, unknown>;

/** Facts about the provider that decide what may be imported at all. */
export type NormalizeOptions = {
  /** When false, every `free/` row is refused: the terms forbid reselling it. */
  resaleFreePool: boolean;
};

export type NormalizeResult = {
  models: NormalizedModel[];
  /** Ids dropped because they name no provider (an upstream alias). */
  skippedAliases: string[];
  /** Ids dropped because they do not output text (image/audio/video rows). */
  skippedMedia: string[];
  /** Ids dropped because this provider forbids reselling its free pool. */
  skippedFreePool: string[];
};

export function emptyFacts(): RawFacts {
  return {
    inputPer1M: null,
    outputPer1M: null,
    freePool: false,
    familyLabel: "",
    supportsTools: null,
    supportsVision: null,
    health: null,
    contextWindow: "",
    name: "",
    outputModalities: null,
    inputModalities: null,
    supportedEndpoints: undefined,
  };
}

/** Merges declared facts, keeping a value only when the patch declares one. */
export function mergeFacts(base: RawFacts, patch: Partial<RawFacts>): RawFacts {
  const merged: RawFacts = { ...base };

  for (const [key, value] of Object.entries(patch) as [
    keyof RawFacts,
    unknown,
  ][]) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;

    (merged as Record<string, unknown>)[key] = value;
  }

  return merged;
}
