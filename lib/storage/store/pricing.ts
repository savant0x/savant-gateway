import type { PostgresDatabase } from "../pg-adapter.ts";
import type { AdminModelSummary, PricingSummary } from "../../types.ts";

import { averageMarginBps } from "../../pricing.ts";

import { getMarkupBps } from "./settings.ts";

/**
 * Pricing summary, ported to the async handle (FID-085 step 4).
 *
 * The arithmetic is a pure function of the model list, so it stays pure and
 * importable: only reading the stored markup needs the database. Keeping the
 * split means the operator's pricing page can be reasoned about (and tested)
 * without a connection.
 *
 * `priced` and `unpriced` exclude free rows on purpose. A free model has no sell
 * price by definition, and counting it as unpriced would make the catalog look
 * like it has a pricing gap where it has a billing mode.
 */
export function summarizePricing(
  models: AdminModelSummary[],
  markupBps: number,
): PricingSummary {
  const catalog = models.filter((model) => model.inCatalog);
  const priced = catalog.filter(
    (model) =>
      model.access !== "free" &&
      (model.inputPricePer1M > 0 || model.outputPricePer1M > 0),
  );
  const unpriced = catalog.filter(
    (model) =>
      model.access !== "free" &&
      model.inputPricePer1M === 0 &&
      model.outputPricePer1M === 0,
  );

  return {
    markupBps,
    pricedCount: priced.length,
    unpricedCount: unpriced.length,
    freeCount: catalog.filter((model) => model.access === "free").length,
    averageInputMarginBps: averageMarginBps(
      priced.map((model) => ({ margin: model.inputMarginBps })),
    ),
    averageOutputMarginBps: averageMarginBps(
      priced.map((model) => ({ margin: model.outputMarginBps })),
    ),
  };
}

export async function getPricingSummary(
  db: PostgresDatabase,
  models: AdminModelSummary[],
): Promise<PricingSummary> {
  return summarizePricing(models, await getMarkupBps(db));
}
