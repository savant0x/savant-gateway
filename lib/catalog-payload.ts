import type { BenchmarkSummary, ModelAccess, ModelSummary } from "./types.ts";
import type { PriceComparison } from "./price-comparison.ts";

import { displayModelId } from "./model-identity.ts";

/**
 * The payloads a client component may receive.
 *
 * A `ModelSummary` carries the stored id, the upstream account slug and the
 * upstream's own model id (FID-2026-1125-002). Every client component serializes
 * its props into the HTML a visitor downloads, so a page that hands one a list of
 * summaries publishes all three. These mappers put the published display id where
 * the stored key was and blank the upstream fields.
 *
 * They live here, not beside the components, because a `"use client"` module's
 * exports cannot be called on the server, and the pages that build these payloads
 * are server components.
 */

/** What the landing price engine renders, and nothing else. */
export type PriceEngineModel = {
  id: string;
  name: string;
  family: string;
  access: ModelAccess;
  inputPricePer1M: number;
  outputPricePer1M: number;
  contextWindow: string;
};

export function priceEngineModels(models: ModelSummary[]): PriceEngineModel[] {
  return models.map((model) => ({
    id: displayModelId(model.id, model.upstreamSlug),
    name: model.name,
    family: model.family,
    access: model.access,
    inputPricePer1M: model.inputPricePer1M,
    outputPricePer1M: model.outputPricePer1M,
    contextWindow: model.contextWindow,
  }));
}

/** What the console's model picker renders. Its id is also the request value. */
export type TesterModel = {
  id: string;
  name: string;
  access: ModelAccess;
  inputPricePer1M: number;
  outputPricePer1M: number;
};

export function testerModels(models: ModelSummary[]): TesterModel[] {
  return models.map((model) => ({
    id: displayModelId(model.id, model.upstreamSlug),
    name: model.name,
    access: model.access,
    inputPricePer1M: model.inputPricePer1M,
    outputPricePer1M: model.outputPricePer1M,
  }));
}

export type CatalogTableData = {
  models: ModelSummary[];
  benchmarks: Record<string, BenchmarkSummary>;
  comparisons: Record<string, PriceComparison>;
};

/**
 * The catalog table's rows and its two lookup maps.
 *
 * `catalogSkuRows` groups on `upstreamId || id`; the display id carries the same
 * canonical key, so putting it in both fields groups the rows exactly as before.
 * The maps are re-keyed to match. Two rows that publish one display id are one
 * SKU row already, so the second copy would only duplicate the payload.
 */
export function catalogTableData(
  models: ModelSummary[],
  benchmarks: Record<string, BenchmarkSummary> = {},
  comparisons: Record<string, PriceComparison> = {},
): CatalogTableData {
  const shown: ModelSummary[] = [];
  const seen = new Set<string>();
  const benchmarkById: Record<string, BenchmarkSummary> = {};
  const comparisonById: Record<string, PriceComparison> = {};

  for (const model of models) {
    const display = displayModelId(model.id, model.upstreamSlug);

    if (seen.has(display)) continue;

    seen.add(display);
    shown.push({
      ...model,
      id: display,
      upstreamId: display,
      upstreamSlug: "",
    });

    const benchmark = benchmarks[model.id];
    const comparison = comparisons[model.id];

    if (benchmark) benchmarkById[display] = benchmark;
    if (comparison) comparisonById[display] = comparison;
  }

  return {
    models: shown,
    benchmarks: benchmarkById,
    comparisons: comparisonById,
  };
}
