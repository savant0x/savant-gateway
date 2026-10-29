/**
 * Price comparison against OpenRouter's public model list. Everything here is
 * pure: parsing their per-token strings, matching by exact upstream id, and
 * expressing the difference in basis points so the UI can say "cheaper" or
 * "pricier" without floating-point drift in the display layer.
 */
export type OpenRouterModel = {
  id: string;
  name: string;
  inputPer1M: number;
  outputPer1M: number;
};

export type PriceComparison = {
  openRouterId: string;
  openRouterName: string;
  inputPer1M: number;
  outputPer1M: number;
  /** Negative means Savant is cheaper. Null when the benchmark price is zero. */
  inputDeltaBps: number | null;
  outputDeltaBps: number | null;
};

export type CatalogComparison = {
  comparisons: Record<string, PriceComparison>;
  matched: number;
  total: number;
};

type ComparableModel = {
  id: string;
  upstreamId: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function per1M(value: unknown): number | null {
  const parsed =
    typeof value === "string" && value.trim() ? Number(value) : value;

  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 1_000_000 * 1_000_000) / 1_000_000;
}

/** `free/gpt-6-luna` and `gpt-6-luna` both resolve to `gpt-6-luna`. */
export function upstreamSlug(upstreamId: string): string {
  return upstreamId
    .trim()
    .toLowerCase()
    .replace(/^free\//, "");
}

export function parseOpenRouterModels(raw: unknown): OpenRouterModel[] {
  const body = record(raw);
  const data = body?.data;

  if (!Array.isArray(data)) return [];

  const models: OpenRouterModel[] = [];

  for (const entry of data) {
    const model = record(entry);
    const id = typeof model?.id === "string" ? model.id.trim() : "";
    const pricing = record(model?.pricing);
    const input = per1M(pricing?.prompt);
    const output = per1M(pricing?.completion);

    if (!id || input === null || output === null) continue;
    // Batch pricing and rotating aliases are different offers, not this model.
    if (id.startsWith("~") || id.includes(":")) continue;

    models.push({
      id,
      name: typeof model?.name === "string" ? model.name : id,
      inputPer1M: input,
      outputPer1M: output,
    });
  }

  return models;
}

export type DeltaSummary = {
  /** Rows at least 0.1% below the benchmark. */
  cheaper: number;
  /** Rows at least 0.1% above the benchmark. */
  pricier: number;
  /** Rows within 0.1% of the benchmark. */
  level: number;
  medianBps: number | null;
};

export type ComparisonSummary = {
  input: DeltaSummary;
  output: DeltaSummary;
  rows: number;
};

function summarizeDeltas(values: Array<number | null>): DeltaSummary {
  const known = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
  const cheaper = known.filter((value) => value < -10).length;
  const pricier = known.filter((value) => value > 10).length;
  const sorted = [...known].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const medianBps =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[middle]
        : Math.round((sorted[middle - 1] + sorted[middle]) / 2);

  return {
    cheaper,
    pricier,
    level: known.length - cheaper - pricier,
    medianBps,
  };
}

/**
 * Headline pricing position across the matched rows. Median rather than mean:
 * one upstream that bills a third of list price should not decide the story for
 * the whole catalog.
 */
export function summarizeComparison(
  rows: Array<Pick<PriceComparison, "inputDeltaBps" | "outputDeltaBps">>,
): ComparisonSummary {
  return {
    input: summarizeDeltas(rows.map((row) => row.inputDeltaBps)),
    output: summarizeDeltas(rows.map((row) => row.outputDeltaBps)),
    rows: rows.length,
  };
}

export function deltaBps(ours: number, theirs: number): number | null {
  if (!Number.isFinite(ours) || !Number.isFinite(theirs) || theirs <= 0) {
    return null;
  }

  return Math.round(((ours - theirs) / theirs) * 10_000);
}

/**
 * Matches each catalog row by its upstream id. The OpenRouter slug is the part
 * after the vendor prefix, so `openai/gpt-6-luna` matches our `gpt-6-luna`.
 * An exact slug is required; a family or a revision guess is never substituted.
 */
export function buildCatalogComparison(
  models: ComparableModel[],
  openRouter: OpenRouterModel[],
): CatalogComparison {
  const bySlug = new Map<string, OpenRouterModel>();

  for (const model of [...openRouter].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const slug = upstreamSlug(model.id.split("/").slice(1).join("/"));
    const key = slug || upstreamSlug(model.id);

    if (!bySlug.has(key)) bySlug.set(key, model);
  }

  const comparisons: Record<string, PriceComparison> = {};
  let matched = 0;

  for (const model of models) {
    const match = bySlug.get(upstreamSlug(model.upstreamId));

    if (!match) continue;

    comparisons[model.id] = {
      openRouterId: match.id,
      openRouterName: match.name,
      inputPer1M: match.inputPer1M,
      outputPer1M: match.outputPer1M,
      inputDeltaBps: deltaBps(model.inputPricePer1M, match.inputPer1M),
      outputDeltaBps: deltaBps(model.outputPricePer1M, match.outputPer1M),
    };
    matched += 1;
  }

  return { comparisons, matched, total: models.length };
}
