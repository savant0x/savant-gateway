import type { IncidentCandidate } from "./operations-types.ts";

export const BALANCE_FRESH_MS = 6 * 60 * 60 * 1000;
export const MIN_RUNWAY_COVERAGE_DAYS = 7;
export const CAPITAL_DEFAULT_WINDOW_DAYS = 30;
export const CAPITAL_MAX_WINDOW_DAYS = 365;

/**
 * Provider capital and runway (FID-2026-1105-006).
 *
 * The page had a balance before this module, but no answer to "how long does
 * this last?". Three honesty rules shape the answer:
 *
 * 1. **Capability decides.** A provider that cannot report a balance has no
 *    runway, even when the funding page shows a number from somewhere else.
 * 2. **Freshness decides.** A balance observed longer ago than six hours is
 *    shown as stale and produces no runway. A stale observation is not
 *    evidence of current capital.
 * 3. **The estimate says what it is.** Runway is the fresh balance divided by
 *    recorded cost per day over a bounded window, and it requires at least a
 *    week of covered history. It ignores committed spend, fees and future
 *    prices; the UI repeats that limitation beside the number.
 */

export type ProviderCapitalState = "current" | "stale" | "unavailable";

export type ProviderCapitalInput = {
  slug: string;
  label: string;
  enabled: boolean;
  configured: boolean;
  supportsBalance: boolean;
  balanceUsd: number | null;
  balanceObservedAt: string | null;
  spendMicros: number;
  coveredDays: number;
  dependentModels: number;
  windowDays: number;
};

export type ProviderCapitalRow = ProviderCapitalInput & {
  balanceState: ProviderCapitalState;
  coverageBps: number;
  dailySpendMicros: number | null;
  runwayDays: number | null;
  runwayReason: string | null;
};

export type ProviderCapitalSummary = {
  providers: number;
  enabledProviders: number;
  currentBalances: number;
  staleBalances: number;
  unavailableBalances: number;
  knownBalanceUsd: number;
  spendMicros: number;
  dependentModels: number;
};

export type ProviderCapitalData = {
  generatedAt: string;
  windowDays: number;
  rows: ProviderCapitalRow[];
  summary: ProviderCapitalSummary;
};

export function normalizeCapitalWindow(
  value: number | string | null | undefined,
) {
  const parsed =
    typeof value === "string" ? Number(value) : (value ?? Number.NaN);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > CAPITAL_MAX_WINDOW_DAYS
  ) {
    return CAPITAL_DEFAULT_WINDOW_DAYS;
  }

  return parsed;
}

export function providerBalanceState(
  input: Pick<
    ProviderCapitalInput,
    "supportsBalance" | "balanceUsd" | "balanceObservedAt"
  >,
  nowMs: number,
): ProviderCapitalState {
  if (!input.supportsBalance) return "unavailable";
  if (input.balanceUsd === null || !input.balanceObservedAt) {
    return "unavailable";
  }

  const observed = Date.parse(input.balanceObservedAt);

  if (!Number.isFinite(observed)) return "unavailable";

  return nowMs - observed <= BALANCE_FRESH_MS ? "current" : "stale";
}

export function toProviderCapitalRow(
  input: ProviderCapitalInput,
  nowIso: string,
): ProviderCapitalRow {
  const nowMs = Date.parse(nowIso);

  if (!Number.isFinite(nowMs)) {
    throw new Error("A valid capital observation instant is required.");
  }

  const balanceState = providerBalanceState(input, nowMs);
  const windowDays = Math.max(1, Math.floor(input.windowDays));
  const coveredDays = Math.max(0, Math.floor(input.coveredDays));
  const coverageBps = Math.min(
    10_000,
    Math.round((Math.min(coveredDays, windowDays) / windowDays) * 10_000),
  );
  const dailySpendMicros = Math.round(
    Math.max(0, input.spendMicros) / windowDays,
  );
  const requiredDays = Math.min(MIN_RUNWAY_COVERAGE_DAYS, windowDays);
  let runwayDays: number | null = null;
  let runwayReason: string | null = null;

  if (!input.supportsBalance) {
    runwayReason = "This provider is not registered for balance reporting.";
  } else if (balanceState === "unavailable") {
    runwayReason = "No usable balance observation is recorded.";
  } else if (balanceState === "stale") {
    runwayReason =
      "The balance observation is older than six hours; refresh it before relying on a runway.";
  } else if ((input.balanceUsd ?? 0) < 0) {
    runwayReason = "The provider reports a negative balance.";
  } else if (coveredDays < requiredDays) {
    runwayReason =
      `Trailing history covers ${coveredDays} of ${windowDays} days; ` +
      `at least ${requiredDays} covered days are required.`;
  } else if (input.spendMicros <= 0) {
    runwayReason = "No recorded upstream cost in the window.";
  } else {
    const balanceMicros = Math.round((input.balanceUsd ?? 0) * 1_000_000);
    const days = balanceMicros / dailySpendMicros;

    runwayDays = Math.round(days * 10) / 10;
  }

  return {
    ...input,
    windowDays,
    coveredDays,
    balanceState,
    coverageBps,
    dailySpendMicros,
    runwayDays,
    runwayReason,
  };
}

export function providerCapitalSummary(
  rows: readonly ProviderCapitalRow[],
): ProviderCapitalSummary {
  let knownBalanceUsd = 0;
  let currentBalances = 0;
  let staleBalances = 0;
  let unavailableBalances = 0;
  let spendMicros = 0;
  let dependentModels = 0;
  let enabledProviders = 0;

  for (const row of rows) {
    spendMicros += row.spendMicros;
    dependentModels += row.dependentModels;
    if (row.enabled) enabledProviders += 1;

    if (row.balanceState === "current") {
      currentBalances += 1;
      knownBalanceUsd += row.balanceUsd ?? 0;
    } else if (row.balanceState === "stale") {
      staleBalances += 1;
    } else {
      unavailableBalances += 1;
    }
  }

  return {
    providers: rows.length,
    enabledProviders,
    currentBalances,
    staleBalances,
    unavailableBalances,
    knownBalanceUsd,
    spendMicros,
    dependentModels,
  };
}

export function economicAlertCandidates(
  input: {
    capital: readonly ProviderCapitalRow[];
    margins: readonly {
      modelId: string;
      modelName: string;
      inputMarginBps: number | null;
      outputMarginBps: number | null;
      costSource: "synced" | "manual" | "unknown";
      costObservedAt: string | null;
    }[];
    customerSpend: readonly { userId: string; spendMicros: number }[];
  },
  thresholds: {
    enabled: boolean;
    runwayMinDays: number;
    marginFloorBps: number;
    staleCostHours: number;
    customerSpendMicros: number;
  },
  nowIso: string,
): IncidentCandidate[] {
  if (!thresholds.enabled) return [];

  const nowMs = Date.parse(nowIso);
  const candidates: IncidentCandidate[] = [];

  if (!Number.isFinite(nowMs)) return candidates;

  for (const provider of input.capital) {
    if (
      provider.runwayDays === null ||
      thresholds.runwayMinDays <= 0 ||
      provider.runwayDays >= thresholds.runwayMinDays
    ) {
      continue;
    }

    candidates.push({
      fingerprint: `economics:runway:${provider.slug}`,
      severity:
        provider.runwayDays < thresholds.runwayMinDays / 2
          ? "critical"
          : "warning",
      title: `Provider ${provider.label} has a short estimated runway`,
      detail:
        `Estimated ${provider.runwayDays.toFixed(1)} days at the current recorded ` +
        `spend pace, below the ${thresholds.runwayMinDays}-day floor. Balance ` +
        `$${(provider.balanceUsd ?? 0).toFixed(2)}, recorded cost ` +
        `$${(provider.spendMicros / 1_000_000).toFixed(2)} over ` +
        `${provider.windowDays} days (${provider.coveredDays} covered). The ` +
        "estimate ignores committed spend and fees. Review /admin/providers.",
    });
  }

  if (thresholds.marginFloorBps > 0) {
    for (const model of input.margins) {
      const worst = Math.min(
        model.inputMarginBps ?? Number.POSITIVE_INFINITY,
        model.outputMarginBps ?? Number.POSITIVE_INFINITY,
      );

      if (!Number.isFinite(worst) || worst >= thresholds.marginFloorBps) {
        continue;
      }

      candidates.push({
        fingerprint: `economics:margin:${model.modelId}`,
        severity: worst < 0 ? "critical" : "warning",
        title: `Model ${model.modelName} is below the margin floor`,
        detail:
          `Current published prices leave ${(worst / 100).toFixed(2)}% margin, ` +
          `below the ${(thresholds.marginFloorBps / 100).toFixed(2)}% floor. ` +
          "Verify the cost basis before repricing. Review /admin/pricing.",
      });
    }
  }

  if (thresholds.staleCostHours > 0) {
    for (const model of input.margins) {
      if (model.costSource !== "manual") continue;

      const observed = model.costObservedAt
        ? Date.parse(model.costObservedAt)
        : Number.NaN;
      const ageHours = Number.isFinite(observed)
        ? (nowMs - observed) / 3_600_000
        : Number.POSITIVE_INFINITY;

      if (ageHours < thresholds.staleCostHours) continue;

      candidates.push({
        fingerprint: `economics:cost:${model.modelId}`,
        severity: "warning",
        title: `Model ${model.modelName} has a stale manual cost`,
        detail:
          (Number.isFinite(ageHours)
            ? `The manual cost was observed ${Math.floor(ageHours)} hours ago, `
            : "The manual cost has no observation time, ") +
          `older than the ${thresholds.staleCostHours}-hour guard. A stale cost ` +
          "can hide a negative margin. Review /admin/pricing.",
      });
    }
  }

  if (thresholds.customerSpendMicros > 0) {
    for (const customer of input.customerSpend) {
      if (customer.spendMicros < thresholds.customerSpendMicros) continue;

      candidates.push({
        fingerprint: `economics:customer:${customer.userId}`,
        severity:
          customer.spendMicros >= thresholds.customerSpendMicros * 2
            ? "critical"
            : "warning",
        title: "A customer's settled spend is above the review threshold",
        detail:
          `Customer ${customer.userId} settled $` +
          `${(customer.spendMicros / 1_000_000).toFixed(2)} of credit in the ` +
          `last 24 hours, above the $` +
          `${(thresholds.customerSpendMicros / 1_000_000).toFixed(2)} threshold. ` +
          "Review /admin/customers.",
      });
    }
  }

  return candidates;
}
