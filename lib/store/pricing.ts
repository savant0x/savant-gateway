import "server-only";

import type { AdminModelSummary, PricingData, PricingSummary } from "../types";

import { averageMarginBps } from "../pricing";

import { getMarkupBps } from "./settings";
import { listAllModels } from "./models";

export function summarizePricing(
  models: AdminModelSummary[],
  markupBps = getMarkupBps(),
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

export function getPricingData(): PricingData {
  const models = listAllModels();
  const markupBps = getMarkupBps();

  return {
    models,
    summary: summarizePricing(models, markupBps),
  };
}
