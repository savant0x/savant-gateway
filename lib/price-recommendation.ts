import type { CatalogEconomicsInput } from "./catalog-economics.ts";
import type { ModelAccess } from "./types.ts";

import { catalogEconomics } from "./catalog-economics.ts";
import { MAX_PRICE_MICROS, marginBps, microsToPrice } from "./pricing.ts";

/**
 * Deterministic, guarded price recommendation (FID-2026-1103-141).
 *
 * A recommendation is an explainable draft. It never publishes: the operator
 * sees the reason, the cost basis and the resulting margin, and an authenticated
 * approval writes the price and its audit row. The same pure function runs in
 * the browser for the preview and on the server for approval, so the approved
 * price cannot differ from the one that was reviewed.
 */

export type RoundingPolicy = "micro" | "cent";

export type RecommendationInput = {
  access: ModelAccess;
  costInputMicros: number;
  costOutputMicros: number;
  currentInputMicros: number;
  currentOutputMicros: number;
  costSource: CatalogEconomicsInput["costSource"];
  costObservedAt?: string | null;
  targetMarginBps: number;
  rounding?: RoundingPolicy;
  minimumSellMicros?: number;
  now?: Date;
  staleAfterDays?: number;
};

export type PriceRecommendation = {
  eligible: boolean;
  reason: string;
  inputMicros: number;
  outputMicros: number;
  inputMarginBps: number | null;
  outputMarginBps: number | null;
  currentInputMarginBps: number | null;
  currentOutputMarginBps: number | null;
  costBasis: "synced" | "manual" | "unknown";
  rounding: RoundingPolicy;
  warnings: string[];
};

export const RECOMMENDATION_LIMITS = {
  minMarginBps: 0,
  /** 99% — a 100% target has no finite sell price. */
  maxMarginBps: 9_900,
  maxChangeWarningBps: 5_000,
} as const;

const CENT_MICROS = 10_000;

function roundUpTo(value: number, unit: number) {
  if (unit <= 1) return Math.ceil(value);

  return Math.ceil(value / unit) * unit;
}

/**
 * sell = cost / (1 - margin). Integer arithmetic keeps the review and the
 * charge identical; the result rounds up so the achieved margin is never below
 * the requested one.
 */
export function sellForMargin(costMicros: number, marginBpsTarget: number) {
  const cost = Math.max(0, Math.round(costMicros));
  const margin = Math.min(
    RECOMMENDATION_LIMITS.maxMarginBps,
    Math.max(0, Math.round(marginBpsTarget)),
  );

  if (cost === 0) return 0;

  const numerator = BigInt(cost) * BigInt(10_000);
  const denominator = BigInt(10_000 - margin);
  const sell = (numerator + denominator - BigInt(1)) / denominator;

  return Number(sell);
}

function ineligible(
  reason: string,
  input: RecommendationInput,
  warnings: string[] = [],
): PriceRecommendation {
  return {
    eligible: false,
    reason,
    inputMicros: input.currentInputMicros,
    outputMicros: input.currentOutputMicros,
    inputMarginBps: null,
    outputMarginBps: null,
    currentInputMarginBps: null,
    currentOutputMarginBps: null,
    costBasis: input.costSource,
    rounding: input.rounding ?? "micro",
    warnings,
  };
}

export function recommendPrices(
  input: RecommendationInput,
): PriceRecommendation {
  if (input.access !== "paid") {
    return ineligible(
      input.access === "free"
        ? "A free group has no per-token sell price; its price is the group allowance."
        : "Subscription pricing belongs to the plan, not the model row.",
      input,
    );
  }

  if (input.costSource === "unknown") {
    return ineligible(
      "Upstream cost is unknown. Set and verify the cost before approving a price.",
      input,
    );
  }

  if (
    !Number.isFinite(input.targetMarginBps) ||
    input.targetMarginBps < RECOMMENDATION_LIMITS.minMarginBps ||
    input.targetMarginBps > RECOMMENDATION_LIMITS.maxMarginBps
  ) {
    return ineligible(
      `Target margin must be between ${RECOMMENDATION_LIMITS.minMarginBps / 100}% and ${RECOMMENDATION_LIMITS.maxMarginBps / 100}%.`,
      input,
    );
  }

  const economics = catalogEconomics({
    access: input.access,
    costInputMicros: input.costInputMicros,
    costOutputMicros: input.costOutputMicros,
    sellInputMicros: input.currentInputMicros,
    sellOutputMicros: input.currentOutputMicros,
    costSource: input.costSource,
    costObservedAt: input.costObservedAt,
    now: input.now,
    staleAfterDays: input.staleAfterDays,
  });

  if (economics.costStale) {
    return ineligible(
      "The manual cost is stale. Re-check it before approving a recommendation.",
      input,
      economics.warnings,
    );
  }

  const rounding = input.rounding ?? "micro";
  const unit = rounding === "cent" ? CENT_MICROS : 1;
  const minimum = Math.max(0, Math.round(input.minimumSellMicros ?? 1));
  const zeroCost = input.costInputMicros <= 0 && input.costOutputMicros <= 0;
  const rawInput = sellForMargin(input.costInputMicros, input.targetMarginBps);
  const rawOutput = sellForMargin(
    input.costOutputMicros,
    input.targetMarginBps,
  );
  const inputMicros = roundUpTo(Math.max(minimum, rawInput), unit);
  const outputMicros = roundUpTo(Math.max(minimum, rawOutput), unit);
  const warnings = [...economics.warnings];

  if (zeroCost) {
    warnings.push(
      "Upstream reports zero cost. The recommended minimum keeps the paid row publishable; verify the cost is real.",
    );
  }

  if (inputMicros > MAX_PRICE_MICROS || outputMicros > MAX_PRICE_MICROS) {
    return ineligible(
      "The recommended price exceeds the configured per-1M price ceiling.",
      input,
      warnings,
    );
  }

  const currentInput = Math.max(0, input.currentInputMicros);
  const currentOutput = Math.max(0, input.currentOutputMicros);

  for (const [label, current, next] of [
    ["input", currentInput, inputMicros],
    ["output", currentOutput, outputMicros],
  ] as const) {
    if (current > 0 && Math.abs(next - current) / current > 1) {
      // A price that more than doubles is not necessarily wrong; it is a
      // change the operator must see, not one the engine silently applies.
      warnings.push(
        `${label} price move exceeds +100%; review before approving.`,
      );
    }
  }

  return {
    eligible: true,
    reason: `Target ${(input.targetMarginBps / 100).toFixed(1)}% margin on ${input.costSource} cost, rounded up to the nearest ${rounding === "cent" ? "cent" : "micro"}.`,
    inputMicros,
    outputMicros,
    inputMarginBps: marginBps(input.costInputMicros, inputMicros),
    outputMarginBps: marginBps(input.costOutputMicros, outputMicros),
    currentInputMarginBps: marginBps(input.costInputMicros, currentInput),
    currentOutputMarginBps: marginBps(input.costOutputMicros, currentOutput),
    costBasis: input.costSource,
    rounding,
    warnings,
  };
}

/** Display helper shared by the preview and the audit row. */
export function recommendationSummary(recommendation: PriceRecommendation) {
  if (!recommendation.eligible) return recommendation.reason;

  return `${microsToPrice(recommendation.inputMicros).toFixed(4)} in / ${microsToPrice(recommendation.outputMicros).toFixed(4)} out per 1M (${(recommendation.inputMarginBps ?? 0) / 100}% / ${(recommendation.outputMarginBps ?? 0) / 100}% margin)`;
}
