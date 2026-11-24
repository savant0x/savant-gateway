import type { AdminModelSummary } from "./types.ts";

/**
 * The pricing fields the browser needs. A trimming of `AdminModelSummary`:
 * `/admin/pricing` shipped the full 470-row catalog (routes, health, sync
 * stamps) to three client components, which is most of a megabyte of HTML for
 * rows the page renders twenty at a time (FID-2026-1124-001).
 *
 * It lives here rather than in `lib/types.ts` so the ceiling that keeps this
 * repository navigable stays satisfied, and next to the projector that is the
 * only writer of it.
 */
export type PricingModelRow = Pick<
  AdminModelSummary,
  | "id"
  | "name"
  | "family"
  | "access"
  | "groupSlug"
  | "inCatalog"
  | "upstreamSlug"
  | "servedProviderSlug"
  | "priceSource"
  | "costSource"
  | "costObservedAt"
  | "costInputPer1M"
  | "costOutputPer1M"
  | "inputPricePer1M"
  | "outputPricePer1M"
  | "inputMarginBps"
  | "outputMarginBps"
  | "blendedProfitMicros"
>;

/**
 * The pricing page's client props, reduced to what the page renders.
 *
 * The trim is not cosmetic: `/admin/pricing` serialised the whole catalog into
 * the browser, including each row's route list and sync stamp, for three client
 * components that read eighteen fields between them. Anything a pricing surface
 * needs must be in `PricingModelRow` — a field left out here is a field the page
 * cannot show, which is the failure mode this protects against
 * (FID-2026-1124-001).
 */
export function toPricingRow(model: AdminModelSummary): PricingModelRow {
  return {
    id: model.id,
    name: model.name,
    family: model.family,
    access: model.access,
    groupSlug: model.groupSlug,
    inCatalog: model.inCatalog,
    upstreamSlug: model.upstreamSlug,
    servedProviderSlug: model.servedProviderSlug,
    priceSource: model.priceSource,
    costSource: model.costSource,
    costObservedAt: model.costObservedAt,
    costInputPer1M: model.costInputPer1M,
    costOutputPer1M: model.costOutputPer1M,
    inputPricePer1M: model.inputPricePer1M,
    outputPricePer1M: model.outputPricePer1M,
    inputMarginBps: model.inputMarginBps,
    outputMarginBps: model.outputMarginBps,
    blendedProfitMicros: model.blendedProfitMicros,
  };
}

export function toPricingRows(models: AdminModelSummary[]): PricingModelRow[] {
  return models.map(toPricingRow);
}
