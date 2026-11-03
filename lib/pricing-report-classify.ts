import type { AdminModelSummary } from "./types.ts";
import type { CatalogEconomics } from "./catalog-economics.ts";
import type { PriceRecommendation } from "./price-recommendation.ts";
import type {
  PricePoint,
  PricingReportClass,
  PricingReportOptions,
  PricingReportRow,
} from "./pricing-report-types.ts";

import { catalogEconomics } from "./catalog-economics.ts";
import { priceToMicros } from "./pricing.ts";
import { DEFAULT_REVIEW_THRESHOLD_BPS } from "./pricing-report-types.ts";

/**
 * Classification rules for the sandbox pricing report (FID-2026-1103-153).
 *
 * These are pure and shared: the report CLI, the table and the tests all use the
 * same decision. A row is only `safe` when the recommendation is eligible, the
 * current price is not below cost, the row is auto-priced, the move is inside
 * the review threshold, and the recommendation carries no warnings.
 */

export function point(economics: CatalogEconomics): PricePoint {
  return {
    inputMicros: economics.sellInputMicros,
    outputMicros: economics.sellOutputMicros,
    inputMarginBps: economics.inputMarginBps,
    outputMarginBps: economics.outputMarginBps,
    scenarioRevenueMicros: economics.scenarioRevenueMicros,
    scenarioCostMicros: economics.scenarioCostMicros,
    scenarioProfitMicros: economics.scenarioProfitMicros,
  };
}

export function recommendedPoint(
  model: AdminModelSummary,
  recommendation: PriceRecommendation,
  options: PricingReportOptions,
): PricePoint {
  const economics = catalogEconomics({
    access: model.access,
    costInputMicros: priceToMicros(model.costInputPer1M),
    costOutputMicros: priceToMicros(model.costOutputPer1M),
    sellInputMicros: recommendation.inputMicros,
    sellOutputMicros: recommendation.outputMicros,
    costSource: model.costSource,
    costObservedAt: model.costObservedAt,
    scenario: options.scenario,
    now: options.now,
    staleAfterDays: options.staleAfterDays,
  });

  return {
    ...point(economics),
    inputMarginBps: recommendation.inputMarginBps,
    outputMarginBps: recommendation.outputMarginBps,
  };
}

/**
 * Relative move. A zero current price with a positive replacement is a "new"
 * price, not an infinite percentage; the report says so instead of printing a
 * number that cannot be compared.
 */
function relativeChangeBps(
  currentMicros: number,
  nextMicros: number,
): number | null {
  if (currentMicros === 0) return nextMicros === 0 ? 0 : null;

  return Math.round(((nextMicros - currentMicros) / currentMicros) * 10_000);
}

export function priceChange(
  current: PricePoint,
  next: PricePoint,
): PricingReportRow["change"] {
  const inputBps = relativeChangeBps(current.inputMicros, next.inputMicros);
  const outputBps = relativeChangeBps(current.outputMicros, next.outputMicros);
  const values = [inputBps, outputBps].filter(
    (value): value is number => value !== null,
  );
  const maxAbsBps = values.length
    ? Math.max(...values.map((value) => Math.abs(value)))
    : null;
  const entirelyNew =
    current.inputMicros === 0 &&
    current.outputMicros === 0 &&
    (next.inputMicros > 0 || next.outputMicros > 0);
  const hasNewComponent = inputBps === null || outputBps === null;
  const totalMove =
    next.inputMicros +
    next.outputMicros -
    current.inputMicros -
    current.outputMicros;
  const direction = entirelyNew
    ? "new"
    : hasNewComponent
      ? totalMove >= 0
        ? "increase"
        : "decrease"
      : (inputBps ?? 0) > 0 || (outputBps ?? 0) > 0
        ? "increase"
        : (inputBps ?? 0) < 0 || (outputBps ?? 0) < 0
          ? "decrease"
          : "unchanged";

  return { inputBps, outputBps, maxAbsBps, direction };
}

export function classifyRow(
  model: AdminModelSummary,
  current: CatalogEconomics,
  recommendation: PriceRecommendation,
  changeSet: PricingReportRow["change"],
  options: PricingReportOptions,
): { classification: PricingReportClass; explanation: string } {
  if (model.access === "free") {
    return {
      classification: "free",
      explanation:
        "Free-group row. Its price is the group allowance, not a per-token sell price.",
    };
  }

  if (model.access === "subscription") {
    return {
      classification: "subscription",
      explanation:
        "Subscription-group row. Price and allowance belong to the plan, not this row.",
    };
  }

  if (!model.inCatalog) {
    return {
      classification: "blocked",
      explanation:
        "Row is not in the published catalog. Publish it before reviewing a price.",
    };
  }

  if (model.costSource === "unknown") {
    return {
      classification: "unknown",
      explanation:
        "Upstream cost is unknown, so margin and modeled profit cannot be trusted.",
    };
  }

  if (current.costStale) {
    return {
      classification: "stale",
      explanation:
        "The manual cost is older than the freshness window. Re-check it before approval.",
    };
  }

  if (!recommendation.eligible) {
    return {
      classification: "blocked",
      explanation: recommendation.reason,
    };
  }

  const negative =
    (current.inputMarginBps !== null && current.inputMarginBps < 0) ||
    (current.outputMarginBps !== null && current.outputMarginBps < 0);
  const threshold = options.reviewThresholdBps ?? DEFAULT_REVIEW_THRESHOLD_BPS;
  const largeMove =
    changeSet.maxAbsBps !== null && changeSet.maxAbsBps > threshold;
  const manual = model.priceSource === "manual";

  if (
    negative ||
    largeMove ||
    manual ||
    changeSet.direction === "new" ||
    recommendation.warnings.length > 0
  ) {
    const reasons = [
      negative ? "current price is below upstream cost" : null,
      largeMove ? `price move exceeds ${(threshold / 100).toFixed(1)}%` : null,
      manual ? "price is manual and must not be replaced silently" : null,
      changeSet.direction === "new" ? "row has no current sell price" : null,
      recommendation.warnings.length > 0
        ? "recommendation carries warnings"
        : null,
    ].filter((value): value is string => value !== null);

    return {
      classification: "review-required",
      explanation: `Operator review required: ${reasons.join("; ")}.`,
    };
  }

  return {
    classification: "safe",
    explanation:
      "Recommendation is eligible and the modeled change is within the review threshold. Approval still requires a reason.",
  };
}

export function blockersFor(
  model: AdminModelSummary,
  current: CatalogEconomics,
  recommendation: PriceRecommendation,
) {
  const blockers = [...current.warnings];

  if (model.access !== "paid") return blockers;
  if (!model.inCatalog) blockers.push("Row is not in the published catalog.");
  if (model.costSource === "unknown")
    blockers.push("Cost is unknown; no recommendation is eligible.");
  if (current.costStale)
    blockers.push("Manual cost is stale; re-check it before approval.");
  if (!recommendation.eligible) blockers.push(recommendation.reason);

  return Array.from(new Set(blockers));
}
