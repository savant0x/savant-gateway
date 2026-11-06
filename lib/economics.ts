import type { PlanInterval } from "./types.ts";

/**
 * Shared operator economics vocabulary (FID-2026-1105-007).
 *
 * Three facts stay separate everywhere in this module:
 *
 * 1. Prepaid top-up principal is a liability, never revenue.
 * 2. Credit charges settle when usage settles; plan cash is observed at the
 *    paid-invoice date, which is a different clock.
 * 3. A recorded upstream cost is an estimate, not a reconciled invoice. Fees,
 *    refunds and free opportunity cost stay unknown until evidence exists.
 *
 * The plan simulator lives separately and is a pure function. It has no
 * database handle, so it cannot publish a plan, mutate a subscription or write a
 * ledger row.
 */

export const ECONOMICS_RANGES = [30, 90, 365] as const;
export type EconomicsRange = (typeof ECONOMICS_RANGES)[number];

export function normalizeEconomicsRange(
  value: string | undefined | null,
): EconomicsRange {
  const parsed = Number(value);

  return ECONOMICS_RANGES.includes(parsed as EconomicsRange)
    ? (parsed as EconomicsRange)
    : 30;
}

export const CUSTOMER_PAGE_SIZE = 25;

export function normalizeCustomerPage(value: string | undefined | null) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export const COHORT_WINDOWS = [7, 30, 90] as const;
export type CohortWindow = (typeof COHORT_WINDOWS)[number];

export function normalizeCohortWindow(
  value: string | undefined | null,
): CohortWindow {
  const parsed = Number(value);

  return COHORT_WINDOWS.includes(parsed as CohortWindow)
    ? (parsed as CohortWindow)
    : 30;
}

export function normalizeObservationWindow(
  value: string | undefined | null,
): CohortWindow {
  return normalizeCohortWindow(value);
}

export type MoneyCoverage = {
  costs: "recorded_estimate";
  planCash: "paid_invoice_date";
  topups: "liability";
  fees: "unavailable";
  refunds: "unavailable";
};

export const MONEY_COVERAGE: MoneyCoverage = {
  costs: "recorded_estimate",
  planCash: "paid_invoice_date",
  topups: "liability",
  fees: "unavailable",
  refunds: "unavailable",
};

export type CustomerContribution = {
  userId: string;
  email: string;
  name: string;
  status: string;
  createdAt: string;
  creditChargedMicros: number;
  creditCostMicros: number;
  subscriptionCostMicros: number;
  freeCostMicros: number;
  totalCostMicros: number;
  planCashMicros: number;
  paidInvoiceCount: number;
  topupPrincipalMicros: number;
  requestCount: number;
  freeRequestCount: number;
  contributionMicros: number;
  creditContributionMicros: number;
  planCashContributionMicros: number;
  coverage: MoneyCoverage;
};

export type CustomerContributionPage = {
  rows: CustomerContribution[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  rangeDays: EconomicsRange;
  since: string;
};

export function customerContribution(
  input: Omit<
    CustomerContribution,
    | "contributionMicros"
    | "creditContributionMicros"
    | "planCashContributionMicros"
    | "coverage"
  >,
): CustomerContribution {
  return {
    ...input,
    contributionMicros:
      input.creditChargedMicros + input.planCashMicros - input.totalCostMicros,
    creditContributionMicros:
      input.creditChargedMicros - input.creditCostMicros,
    planCashContributionMicros:
      input.planCashMicros - input.subscriptionCostMicros,
    coverage: MONEY_COVERAGE,
  };
}

export type FreeCohortCounts = {
  eligibleSignups: number;
  withFirstFree: number;
  convertedAfterFree: number;
  paidWithoutFree: number;
  unknownHistory: number;
  observedActivity: number;
};

export type FreeCohort = FreeCohortCounts & {
  cohortDays: CohortWindow;
  observationDays: CohortWindow;
  cohortStart: string;
  cohortEnd: string;
  signupToPaidBps: number | null;
  freeToPaidBps: number | null;
  unknownHistoryBps: number | null;
  causalAttribution: "not_claimed";
};

function rateBps(numerator: number, denominator: number) {
  if (denominator <= 0) return null;

  return Math.round((numerator / denominator) * 10_000);
}

export function summarizeFreeCohort(input: {
  cohortDays: CohortWindow;
  observationDays: CohortWindow;
  cohortStart: string;
  cohortEnd: string;
  counts: FreeCohortCounts;
}): FreeCohort {
  const { counts } = input;

  return {
    ...counts,
    cohortDays: input.cohortDays,
    observationDays: input.observationDays,
    cohortStart: input.cohortStart,
    cohortEnd: input.cohortEnd,
    signupToPaidBps: rateBps(
      counts.convertedAfterFree + counts.paidWithoutFree,
      counts.eligibleSignups,
    ),
    freeToPaidBps: rateBps(counts.convertedAfterFree, counts.withFirstFree),
    unknownHistoryBps: rateBps(counts.unknownHistory, counts.eligibleSignups),
    causalAttribution: "not_claimed",
  };
}

export type SimulationModel = {
  id: string;
  name: string;
  groupSlug: string;
  tokenWeight: number;
  costInputMicros: number;
  costOutputMicros: number;
  sellInputMicros: number;
  sellOutputMicros: number;
  costSource: "synced" | "manual" | "unknown";
  costObservedAt: string | null;
};

export type SimulationUsage = {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
};

export type SimulationWorkload = {
  label: "light" | "normal" | "heavy";
  usage: SimulationUsage[];
};

export type PlanSimulationTerms = {
  priceMicros: number;
  interval: PlanInterval;
  includedWeightedTokens: number;
  overageMode: "block" | "credit";
  overageMarkupBps: number;
};

export type PlanSimulationRow = {
  modelId: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  weightedTokens: number;
  costMicros: number | null;
  sellMicros: number;
  costKnown: boolean;
  costStale: boolean;
};

export type PlanSimulationScenario = {
  label: SimulationWorkload["label"];
  status: "within_allowance" | "overage_credit" | "blocked";
  weightedTokens: number;
  includedWeightedTokensUsed: number;
  overageWeightedTokens: number;
  planRevenueMicros: number;
  overageRevenueMicros: number;
  revenueMicros: number;
  costMicros: number;
  contributionMicros: number | null;
  marginBps: number | null;
  monthlyRunRateMicros: number;
  costKnown: boolean;
  costStale: boolean;
  unknownModelIds: string[];
  warnings: string[];
  rows: PlanSimulationRow[];
};

export type PlanSimulation = {
  terms: PlanSimulationTerms;
  scenarios: PlanSimulationScenario[];
  simulated: true;
  writes: "none";
};
