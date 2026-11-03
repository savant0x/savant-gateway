import type { AdminModelSummary } from "./types.ts";
import type {
  PricingReport,
  PricingReportClass,
  PricingReportOptions,
  PricingReportRow,
} from "./pricing-report-types.ts";

import { catalogEconomics } from "./catalog-economics.ts";
import { recommendPrices } from "./price-recommendation.ts";
import { priceToMicros } from "./pricing.ts";
import {
  blockersFor,
  classifyRow,
  point,
  priceChange,
  recommendedPoint,
} from "./pricing-report-classify.ts";
import { DEFAULT_REVIEW_THRESHOLD_BPS } from "./pricing-report-types.ts";

/**
 * Sandbox pricing economics report builder (FID-2026-1103-153).
 *
 * One row per catalog entry: the cost the serving route reports, the price the
 * gateway currently charges, the guarded recommendation, and the reason an
 * operator can or cannot approve it. The report is a read-only projection. It
 * never writes a price; approval stays on `PATCH /api/admin/pricing`.
 *
 * Scenario profit is modeled at a labelled token workload. Realized profit is
 * a settlement fact and is deliberately absent here, so a missing usage row
 * cannot look like zero profit.
 */

export type {
  PricePoint,
  PricingReport,
  PricingReportClass,
  PricingReportOptions,
  PricingReportRow,
  PricingReportSummary,
} from "./pricing-report-types.ts";
export { DEFAULT_REVIEW_THRESHOLD_BPS } from "./pricing-report-types.ts";

const CLASS_ORDER: Record<PricingReportClass, number> = {
  unknown: 0,
  stale: 1,
  blocked: 2,
  "review-required": 3,
  safe: 4,
  free: 5,
  subscription: 6,
};

export function buildPricingReport(
  models: AdminModelSummary[],
  options: PricingReportOptions,
): PricingReport {
  const now = options.now ?? new Date();
  const rounding = options.rounding ?? "micro";
  const reviewThresholdBps =
    options.reviewThresholdBps ?? DEFAULT_REVIEW_THRESHOLD_BPS;
  const resolved = { ...options, now, reviewThresholdBps };
  const counts: Record<PricingReportClass, number> = {
    free: 0,
    subscription: 0,
    unknown: 0,
    stale: 0,
    blocked: 0,
    "review-required": 0,
    safe: 0,
  };
  const rows: PricingReportRow[] = [];
  let excludedOutOfCatalog = 0;

  for (const model of models) {
    if (!model.inCatalog && !options.includeOutOfCatalog) {
      excludedOutOfCatalog += 1;
      continue;
    }

    const costInputMicros = priceToMicros(model.costInputPer1M);
    const costOutputMicros = priceToMicros(model.costOutputPer1M);
    const current = catalogEconomics({
      access: model.access,
      costInputMicros,
      costOutputMicros,
      sellInputMicros: priceToMicros(model.inputPricePer1M),
      sellOutputMicros: priceToMicros(model.outputPricePer1M),
      costSource: model.costSource,
      costObservedAt: model.costObservedAt,
      scenario: options.scenario,
      now,
      staleAfterDays: options.staleAfterDays,
    });
    const recommendation = recommendPrices({
      access: model.access,
      costInputMicros,
      costOutputMicros,
      currentInputMicros: priceToMicros(model.inputPricePer1M),
      currentOutputMicros: priceToMicros(model.outputPricePer1M),
      costSource: model.costSource,
      costObservedAt: model.costObservedAt,
      targetMarginBps: options.targetMarginBps,
      rounding,
      minimumSellMicros: options.minimumSellMicros,
      now,
      staleAfterDays: options.staleAfterDays,
    });
    const currentPoint = point(current);
    const recommended = recommendation.eligible
      ? recommendedPoint(model, recommendation, resolved)
      : null;
    const changeSet = recommended
      ? priceChange(currentPoint, recommended)
      : {
          inputBps: null,
          outputBps: null,
          maxAbsBps: null,
          direction: "unchanged" as const,
        };
    const { classification, explanation } = classifyRow(
      model,
      current,
      recommendation,
      changeSet,
      resolved,
    );
    const impactMicros = recommended
      ? Math.abs(
          recommended.scenarioProfitMicros - current.scenarioProfitMicros,
        )
      : 0;

    counts[classification] += 1;
    rows.push({
      id: model.id,
      name: model.name,
      access: model.access,
      groupSlug: model.groupSlug,
      groupLabel: model.groupLabel,
      inCatalog: model.inCatalog,
      upstreamProvider: model.upstreamSlug,
      servingProvider: model.servedProviderSlug,
      routeTakeover:
        model.servedProviderSlug !== null &&
        model.servedProviderSlug !== model.upstreamSlug,
      costSource: model.costSource,
      costObservedAt: model.costObservedAt,
      costInputMicros,
      costOutputMicros,
      priceSource: model.priceSource,
      syncedAt: model.syncedAt,
      classification,
      eligible: recommendation.eligible,
      explanation,
      blockers: blockersFor(model, current, recommendation),
      warnings: recommendation.warnings,
      current: currentPoint,
      recommendation,
      recommended,
      change: changeSet,
      impactMicros,
    });
  }

  rows.sort(
    (left, right) =>
      CLASS_ORDER[left.classification] - CLASS_ORDER[right.classification] ||
      right.impactMicros - left.impactMicros ||
      left.name.localeCompare(right.name),
  );

  const modeled = rows.filter(
    (row) =>
      row.access === "paid" &&
      row.inCatalog &&
      row.costSource !== "unknown" &&
      row.classification !== "stale" &&
      Number.isFinite(row.current.scenarioCostMicros),
  );
  const currentScenarioProfitMicros = modeled.reduce(
    (total, row) => total + row.current.scenarioProfitMicros,
    0,
  );
  const recommendedScenarioProfitMicros = modeled.reduce(
    (total, row) =>
      total +
      (row.recommended?.scenarioProfitMicros ??
        row.current.scenarioProfitMicros),
    0,
  );
  const scenario = options.scenario ?? {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  };

  return {
    report: "sandbox-pricing-economics",
    schema: 1,
    summary: {
      generatedAt: now.toISOString(),
      source: "sandbox",
      scenario,
      targetMarginBps: options.targetMarginBps,
      rounding,
      reviewThresholdBps,
      counts,
      paidRows: rows.filter((row) => row.access === "paid").length,
      reviewRows: counts["review-required"],
      blockedRows: counts.blocked + counts.unknown + counts.stale,
      currentScenarioProfitMicros,
      recommendedScenarioProfitMicros,
      modeledProfitDeltaMicros:
        recommendedScenarioProfitMicros - currentScenarioProfitMicros,
      excludedOutOfCatalog,
      autoPublish: false,
    },
    rows,
  };
}

/** The highest-impact rows an operator should inspect first. */
export function reviewQueue(
  report: PricingReport,
  limit = 10,
): PricingReportRow[] {
  return report.rows
    .filter((row) => row.classification === "review-required")
    .sort((left, right) => right.impactMicros - left.impactMicros)
    .slice(0, Math.max(0, limit));
}
