import type { ModelAccess } from "./types.ts";

import {
  blendedProfitMicros,
  computeTokenCostMicros,
  marginBps,
} from "./pricing.ts";

/**
 * One economics projection for the catalog, pricing table, recommendation
 * controls and charts (FID-2026-1103-141).
 *
 * Before this module the catalog showed a sell price, the pricing table
 * recalculated a margin, and the recommendation would have needed a third
 * formula. They must not disagree: the numbers an operator approves have to be
 * the numbers the gateway charges and the charts plot.
 *
 * Everything is integer micro-dollars. A scenario is a labelled workload, not
 * realised revenue; realised revenue stays in the analytics series.
 */

export type EconomicsScenario = {
  inputTokens: number;
  outputTokens: number;
};

export const DEFAULT_ECONOMICS_SCENARIO: EconomicsScenario = {
  inputTokens: 1_000_000,
  outputTokens: 1_000_000,
};

export type PricingStatus = "free" | "subscription" | "priced" | "unpriced";

export type CatalogEconomics = {
  status: PricingStatus;
  costInputMicros: number;
  costOutputMicros: number;
  sellInputMicros: number;
  sellOutputMicros: number;
  inputMarginBps: number | null;
  outputMarginBps: number | null;
  /** Profit for the labelled 1M-in + 1M-out scenario. */
  blendedProfitMicros: number;
  scenario: EconomicsScenario;
  scenarioRevenueMicros: number;
  scenarioCostMicros: number;
  scenarioProfitMicros: number;
  costKnown: boolean;
  costStale: boolean;
  warnings: string[];
};

export type CatalogEconomicsInput = {
  access: ModelAccess;
  costInputMicros: number;
  costOutputMicros: number;
  sellInputMicros: number;
  sellOutputMicros: number;
  costSource: "synced" | "manual" | "unknown";
  costObservedAt?: string | null;
  priceSource?: "auto" | "manual";
  scenario?: EconomicsScenario;
  now?: Date;
  staleAfterDays?: number;
};

const DEFAULT_STALE_AFTER_DAYS = 30;

function safeTokens(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function isStale(
  costSource: CatalogEconomicsInput["costSource"],
  observedAt: string | null | undefined,
  now: Date,
  days: number,
) {
  if (costSource !== "manual" || !observedAt || days <= 0) return false;

  const at = new Date(observedAt);

  if (Number.isNaN(at.getTime())) return false;

  return now.getTime() - at.getTime() > days * 86_400_000;
}

export function catalogEconomics(
  input: CatalogEconomicsInput,
): CatalogEconomics {
  const scenario = input.scenario ?? DEFAULT_ECONOMICS_SCENARIO;
  const inputTokens = safeTokens(scenario.inputTokens);
  const outputTokens = safeTokens(scenario.outputTokens);
  const free = input.access === "free";
  const subscription = input.access === "subscription";
  const sellInput =
    free || subscription ? 0 : Math.max(0, input.sellInputMicros);
  const sellOutput =
    free || subscription ? 0 : Math.max(0, input.sellOutputMicros);
  const costKnown = input.costSource !== "unknown";
  const costStale = isStale(
    input.costSource,
    input.costObservedAt,
    input.now ?? new Date(),
    input.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS,
  );
  const scenarioRevenueMicros =
    computeTokenCostMicros(inputTokens, sellInput) +
    computeTokenCostMicros(outputTokens, sellOutput);
  const scenarioCostMicros =
    computeTokenCostMicros(inputTokens, input.costInputMicros) +
    computeTokenCostMicros(outputTokens, input.costOutputMicros);
  const warnings: string[] = [];

  if (!costKnown) {
    warnings.push(
      "Upstream cost is unknown; margin and profit cannot be trusted.",
    );
  }

  if (costStale) {
    warnings.push("The manual cost is older than the freshness window.");
  }

  const status: PricingStatus = free
    ? "free"
    : subscription
      ? "subscription"
      : sellInput > 0 || sellOutput > 0
        ? "priced"
        : "unpriced";

  if (status === "unpriced") {
    warnings.push("A paid row without a sell price cannot be published.");
  }

  const inputMargin = costKnown
    ? marginBps(input.costInputMicros, sellInput)
    : null;
  const outputMargin = costKnown
    ? marginBps(input.costOutputMicros, sellOutput)
    : null;

  if (
    (inputMargin !== null && inputMargin < 0) ||
    (outputMargin !== null && outputMargin < 0)
  ) {
    warnings.push("At least one direction is priced below upstream cost.");
  }

  return {
    status,
    costInputMicros: Math.max(0, input.costInputMicros),
    costOutputMicros: Math.max(0, input.costOutputMicros),
    sellInputMicros: sellInput,
    sellOutputMicros: sellOutput,
    inputMarginBps: inputMargin,
    outputMarginBps: outputMargin,
    blendedProfitMicros: blendedProfitMicros({
      costInputMicros: input.costInputMicros,
      costOutputMicros: input.costOutputMicros,
      sellInputMicros: sellInput,
      sellOutputMicros: sellOutput,
    }),
    scenario: { inputTokens, outputTokens },
    scenarioRevenueMicros,
    scenarioCostMicros,
    scenarioProfitMicros: scenarioRevenueMicros - scenarioCostMicros,
    costKnown,
    costStale,
    warnings,
  };
}

/** Human label for the scenario, used next to every profit number. */
export function scenarioLabel(scenario: EconomicsScenario) {
  const format = (tokens: number) =>
    tokens >= 1_000_000
      ? `${tokens / 1_000_000}M`
      : tokens >= 1_000
        ? `${tokens / 1_000}K`
        : String(tokens);

  return `${format(scenario.inputTokens)} in + ${format(scenario.outputTokens)} out`;
}
