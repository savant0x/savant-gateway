import type {
  PlanSimulation,
  PlanSimulationRow,
  PlanSimulationScenario,
  PlanSimulationTerms,
  SimulationModel,
  SimulationWorkload,
} from "./economics.ts";

import { catalogEconomics } from "./catalog-economics.ts";
import { monthlyRecurringMicros } from "./revenue.ts";
import { markupSellMicros, subscriptionWeightedTokens } from "./plans.ts";

/**
 * Read-only plan what-if (FID-2026-1105-007).
 *
 * The caller supplies operator-entered workloads. This function never reads or
 * writes a plan or subscription, and has no database handle.
 *
 * Overage revenue is allocated across models in proportion to their weighted
 * usage. That proportional mix is a simulation assumption, not a replay of the
 * gateway's per-call admission decision; the UI labels it as simulated.
 */

function safeTokens(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function scenarioFor(
  terms: PlanSimulationTerms,
  models: Map<string, SimulationModel>,
  workload: SimulationWorkload,
  now: Date,
): PlanSimulationScenario {
  const unknownModelIds: string[] = [];
  const warnings: string[] = [];
  const rows: PlanSimulationRow[] = [];

  for (const usage of workload.usage) {
    const model = models.get(usage.modelId);

    if (!model) {
      unknownModelIds.push(usage.modelId);
      continue;
    }

    const inputTokens = safeTokens(usage.inputTokens);
    const outputTokens = safeTokens(usage.outputTokens);
    const weightedTokens = subscriptionWeightedTokens(
      model.tokenWeight,
      inputTokens,
      outputTokens,
    );
    const markedInput = markupSellMicros(
      model.sellInputMicros,
      terms.overageMarkupBps,
    );
    const markedOutput = markupSellMicros(
      model.sellOutputMicros,
      terms.overageMarkupBps,
    );
    const economics = catalogEconomics({
      access: "paid",
      costInputMicros: model.costInputMicros,
      costOutputMicros: model.costOutputMicros,
      sellInputMicros: markedInput,
      sellOutputMicros: markedOutput,
      costSource: model.costSource,
      costObservedAt: model.costObservedAt,
      scenario: { inputTokens, outputTokens },
      now,
    });

    rows.push({
      modelId: model.id,
      modelName: model.name,
      inputTokens,
      outputTokens,
      weightedTokens,
      costMicros: economics.costKnown ? economics.scenarioCostMicros : null,
      sellMicros: economics.scenarioRevenueMicros,
      costKnown: economics.costKnown,
      costStale: economics.costStale,
    });

    for (const warning of economics.warnings) {
      if (!warnings.includes(warning)) warnings.push(warning);
    }
  }

  if (unknownModelIds.length > 0) {
    warnings.push(
      "One or more workload models are no longer in the catalog; their usage is excluded.",
    );
  }

  const weightedTokens = rows.reduce(
    (total, row) => total + row.weightedTokens,
    0,
  );
  const allowance = safeTokens(terms.includedWeightedTokens);
  const overageWeightedTokens = Math.max(0, weightedTokens - allowance);
  const includedWeightedTokensUsed = Math.min(weightedTokens, allowance);
  const costKnown =
    rows.length > 0 &&
    rows.every((row) => row.costKnown) &&
    unknownModelIds.length === 0;
  const costStale = rows.some((row) => row.costStale);
  const planRevenueMicros = Math.max(0, Math.round(terms.priceMicros));
  const blocked = terms.overageMode === "block" && overageWeightedTokens > 0;
  const overageShare =
    weightedTokens > 0 ? overageWeightedTokens / weightedTokens : 0;
  const overageRevenueMicros =
    terms.overageMode === "credit"
      ? rows.reduce(
          (total, row) => total + Math.round(row.sellMicros * overageShare),
          0,
        )
      : 0;
  const costMicros = rows.reduce(
    (total, row) => total + (row.costMicros ?? 0),
    0,
  );
  const revenueMicros = planRevenueMicros + overageRevenueMicros;
  const contributionMicros = blocked ? null : revenueMicros - costMicros;
  const marginBps =
    contributionMicros === null || revenueMicros <= 0
      ? null
      : Math.round((contributionMicros / revenueMicros) * 10_000);

  if (!costKnown) {
    warnings.push(
      "At least one model's cost is unknown, so contribution is incomplete.",
    );
  }

  if (costStale) {
    warnings.push("At least one cost is older than the freshness window.");
  }

  if (blocked) {
    warnings.push(
      "This workload exceeds the allowance and the plan blocks overage; no contribution is projected.",
    );
  }

  return {
    label: workload.label,
    status: blocked
      ? "blocked"
      : overageWeightedTokens > 0
        ? "overage_credit"
        : "within_allowance",
    weightedTokens,
    includedWeightedTokensUsed,
    overageWeightedTokens,
    planRevenueMicros,
    overageRevenueMicros,
    revenueMicros,
    costMicros,
    contributionMicros,
    marginBps,
    monthlyRunRateMicros: monthlyRecurringMicros(
      planRevenueMicros,
      terms.interval,
    ),
    costKnown,
    costStale,
    unknownModelIds,
    warnings,
    rows,
  };
}

export function simulatePlan(input: {
  terms: PlanSimulationTerms;
  models: SimulationModel[];
  workloads: SimulationWorkload[];
  now?: Date;
}): PlanSimulation {
  const now = input.now ?? new Date();
  const models = new Map(input.models.map((model) => [model.id, model]));

  return {
    terms: {
      ...input.terms,
      priceMicros: Math.max(0, Math.round(input.terms.priceMicros)),
      includedWeightedTokens: safeTokens(input.terms.includedWeightedTokens),
      overageMarkupBps: Math.min(
        100_000,
        Math.max(0, Math.round(input.terms.overageMarkupBps)),
      ),
    },
    scenarios: input.workloads.map((workload) =>
      scenarioFor(input.terms, models, workload, now),
    ),
    simulated: true,
    writes: "none",
  };
}
