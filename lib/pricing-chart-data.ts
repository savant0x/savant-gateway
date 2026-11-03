import type { AdminModelSummary } from "./types.ts";
import type { PricingDecision } from "./storage/store/pricing-decisions.ts";

import { catalogEconomics } from "./catalog-economics.ts";
import { priceToMicros } from "./pricing.ts";

/**
 * Pure chart series for the pricing decision surface (FID-2026-1103-141).
 *
 * Charts must plot the same integers the table and the gateway use. These
 * builders take the existing summaries and decision rows, so no chart invents a
 * price or a route. Empty inputs return empty series and the UI renders an
 * explicit empty state instead of a zero line that looks like data.
 */

export type MarginBucket = {
  label: string;
  count: number;
  negative: boolean;
};

const MARGIN_BUCKETS = [
  { label: "Below 0%", min: -Infinity, max: 0 },
  { label: "0–10%", min: 0, max: 1_000 },
  { label: "10–20%", min: 1_000, max: 2_000 },
  { label: "20–30%", min: 2_000, max: 3_000 },
  { label: "30–40%", min: 3_000, max: 4_000 },
  { label: "40%+", min: 4_000, max: Infinity },
] as const;

export function marginBuckets(models: AdminModelSummary[]): MarginBucket[] {
  const buckets = MARGIN_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: 0,
    negative: bucket.max <= 0,
  }));

  for (const model of models) {
    if (!model.inCatalog || model.access !== "paid") continue;

    const economics = catalogEconomics({
      access: model.access,
      costInputMicros: priceToMicros(model.costInputPer1M),
      costOutputMicros: priceToMicros(model.costOutputPer1M),
      sellInputMicros: priceToMicros(model.inputPricePer1M),
      sellOutputMicros: priceToMicros(model.outputPricePer1M),
      costSource: model.costSource,
      costObservedAt: model.costObservedAt,
    });
    const margin =
      economics.scenarioRevenueMicros <= 0
        ? -1
        : Math.round(
            (economics.scenarioProfitMicros / economics.scenarioRevenueMicros) *
              10_000,
          );
    const index = MARGIN_BUCKETS.findIndex(
      (bucket) => margin >= bucket.min && margin < bucket.max,
    );

    if (index >= 0) buckets[index].count += 1;
  }

  return buckets;
}

export type PriceHistoryPoint = {
  date: string;
  averageInputMicros: number;
  averageOutputMicros: number;
  changes: number;
};

/** One point per UTC day that has at least one approved price. */
export function priceHistorySeries(
  decisions: PricingDecision[],
): PriceHistoryPoint[] {
  const days = new Map<
    string,
    { input: number; output: number; changes: number }
  >();

  for (const decision of decisions) {
    const date = decision.createdAt.slice(0, 10);
    const entry = days.get(date) ?? { input: 0, output: 0, changes: 0 };

    entry.input += decision.afterInputMicros;
    entry.output += decision.afterOutputMicros;
    entry.changes += 1;
    days.set(date, entry);
  }

  return Array.from(days, ([date, entry]) => ({
    date,
    averageInputMicros: Math.round(entry.input / entry.changes),
    averageOutputMicros: Math.round(entry.output / entry.changes),
    changes: entry.changes,
  })).sort((left, right) => left.date.localeCompare(right.date));
}

export type RouteMixEntry = {
  provider: string;
  models: number;
  served: number;
};

/** Catalog rows per provider, and how many of them currently serve. */
export function routeMix(models: AdminModelSummary[]): RouteMixEntry[] {
  const entries = new Map<string, RouteMixEntry>();
  const catalog = models.filter((model) => model.inCatalog);

  for (const model of catalog) {
    const provider = model.upstreamSlug;
    const entry = entries.get(provider) ?? {
      provider,
      models: 0,
      served: 0,
    };

    entry.models += 1;

    if (
      !model.servedProviderSlug ||
      model.servedProviderSlug === model.upstreamSlug
    ) {
      entry.served += 1;
    }

    entries.set(provider, entry);
  }

  return Array.from(entries.values()).sort(
    (left, right) =>
      right.models - left.models || left.provider.localeCompare(right.provider),
  );
}
