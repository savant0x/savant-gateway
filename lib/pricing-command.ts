import type { ModelAccess } from "./types.ts";

import { computeTokenCostMicros, marginBps, priceToMicros } from "./pricing.ts";

/**
 * Pricing command center math (FID-2026-1105-005).
 *
 * This module is deliberately pure: the store aggregates the durable usage
 * rows, and these helpers decide how the operator sees them. Three rules are
 * encoded here rather than in SQL so the page, the tests and any later report
 * cannot disagree about them:
 *
 * 1. **Unknown is not zero.** A row whose cost basis is unknown keeps its
 *    settled revenue but contributes no cost and no contribution. The summary
 *    therefore reports coverage next to the totals.
 * 2. **A window is bounded and UTC.** The caller passes an instant; the cutoff
 *    is an exact millisecond subtraction, not a locale or month boundary.
 * 3. **An approval carries a version.** The price and the served cost that the
 *    preview saw travel with the approval, and a mismatch is a conflict rather
 *    than a silent reprice.
 */

export const PRICING_COMMAND_WINDOWS = [7, 30, 90] as const;
export const PRICING_COMMAND_DEFAULT_WINDOW = 30;
export const PRICING_COMMAND_MAX_WINDOW = 365;
export const PRICING_COMMAND_PAGE_SIZE = 10;
export const PRICING_COMMAND_MAX_ROWS = 2_000;

export type PricingSortKey =
  "contribution" | "revenue" | "requests" | "tokens" | "margin" | "name";

export type PricingSortDirection = "asc" | "desc";

export type PricingCommandCostSource = "synced" | "manual" | "unknown";

export type PricingVersion = {
  sellInputMicros: number;
  sellOutputMicros: number;
  costInputMicros: number;
  costOutputMicros: number;
};

export type HistoricalVolume = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
};

export type PricingCommandRow = {
  modelId: string;
  modelName: string;
  family: string;
  groupSlug: string;
  access: ModelAccess;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  /** Settled credit revenue only; free and included plan calls are excluded. */
  revenueMicros: number;
  /** Recorded upstream cost, or null when the cost basis is unknown. */
  costMicros: number | null;
  contributionMicros: number | null;
  marginBps: number | null;
  unknownCostRequests: number;
  coverageBps: number;
  sellInputMicros: number;
  sellOutputMicros: number;
  costInputMicros: number;
  costOutputMicros: number;
  costSource: PricingCommandCostSource;
  costObservedAt: string | null;
  inCatalog: boolean;
};

export type PricingCommandSummary = {
  rangeDays: number;
  models: number;
  requests: number;
  revenueMicros: number;
  /** Revenue on rows whose cost is known, the denominator for margin. */
  knownRevenueMicros: number;
  costMicros: number;
  contributionMicros: number;
  marginBps: number | null;
  unknownCostRequests: number;
  coverageBps: number;
};

export type PricingCommandData = {
  generatedAt: string;
  rangeDays: number;
  rows: PricingCommandRow[];
  summary: PricingCommandSummary;
};

export function normalizePricingWindow(
  value: number | string | null | undefined,
  fallback = PRICING_COMMAND_DEFAULT_WINDOW,
) {
  const parsed =
    typeof value === "string" ? Number(value) : (value ?? Number.NaN);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > PRICING_COMMAND_MAX_WINDOW
  ) {
    return fallback;
  }

  return parsed;
}

export function normalizePricingSort(
  value: string | null | undefined,
): PricingSortKey {
  switch (value) {
    case "contribution":
    case "revenue":
    case "requests":
    case "tokens":
    case "margin":
    case "name":
      return value;
    default:
      return "contribution";
  }
}

export function normalizePricingDirection(
  value: string | null | undefined,
): PricingSortDirection {
  return value === "asc" ? "asc" : "desc";
}

/** Exact trailing window, expressed in UTC milliseconds. */
export function pricingWindowCutoff(nowIso: string, rangeDays: number) {
  const now = Date.parse(nowIso);

  if (!Number.isFinite(now)) {
    throw new Error("A valid pricing window instant is required.");
  }

  return new Date(
    now - normalizePricingWindow(rangeDays) * 86_400_000,
  ).toISOString();
}

function sortValue(row: PricingCommandRow, key: PricingSortKey) {
  switch (key) {
    case "revenue":
      return row.revenueMicros;
    case "requests":
      return row.requests;
    case "tokens":
      return row.inputTokens + row.outputTokens;
    case "margin":
      return row.marginBps;
    case "name":
      return null;
    default:
      return row.contributionMicros;
  }
}

/**
 * Contribution first, with unknown contribution last in both directions.
 * Sorting unknown rows as zero would hide exactly the rows the operator needs
 * to price, and reversing the direction must not promote them.
 */
export function sortPricingRows(
  rows: readonly PricingCommandRow[],
  sort: PricingSortKey,
  direction: PricingSortDirection,
) {
  return [...rows].sort((left, right) => {
    if (sort === "name") {
      const byName = left.modelName.localeCompare(right.modelName);

      if (byName !== 0) return direction === "asc" ? byName : -byName;

      return left.modelId.localeCompare(right.modelId);
    }

    const a = sortValue(left, sort);
    const b = sortValue(right, sort);

    if (a === null && b === null) {
      return left.modelId.localeCompare(right.modelId);
    }
    if (a === null) return 1;
    if (b === null) return -1;
    if (a !== b) return direction === "asc" ? a - b : b - a;

    return left.modelName.localeCompare(right.modelName);
  });
}

export function paginatePricingRows(
  rows: readonly PricingCommandRow[],
  page: number,
  pageSize = PRICING_COMMAND_PAGE_SIZE,
) {
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const safePage = Math.min(pageCount, Math.max(1, Math.floor(page) || 1));
  const start = (safePage - 1) * size;

  return {
    page: safePage,
    pageCount,
    total: rows.length,
    rows: rows.slice(start, start + size),
  };
}

export function pricingVersionOf(input: PricingVersion): PricingVersion {
  const micro = (value: number) =>
    Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

  return {
    sellInputMicros: micro(input.sellInputMicros),
    sellOutputMicros: micro(input.sellOutputMicros),
    costInputMicros: micro(input.costInputMicros),
    costOutputMicros: micro(input.costOutputMicros),
  };
}

export function pricingVersionMatches(
  expected: PricingVersion,
  current: PricingVersion,
) {
  return (
    expected.sellInputMicros === current.sellInputMicros &&
    expected.sellOutputMicros === current.sellOutputMicros &&
    expected.costInputMicros === current.costInputMicros &&
    expected.costOutputMicros === current.costOutputMicros
  );
}

/**
 * Reads the version a recommendation was previewed against from a request body.
 * The values are USD per 1M because that is what the admin surfaces show; they
 * are converted to integer micros once, here, before any comparison.
 */
export function readPricingVersion(value: unknown): PricingVersion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const body = value as Record<string, unknown>;
  const read = (key: string) => {
    const raw = body[key];

    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
      return null;
    }

    return priceToMicros(raw);
  };
  const sellInputMicros = read("inputPricePer1M");
  const sellOutputMicros = read("outputPricePer1M");
  const costInputMicros = read("costInputPer1M");
  const costOutputMicros = read("costOutputPer1M");

  if (
    sellInputMicros === null ||
    sellOutputMicros === null ||
    costInputMicros === null ||
    costOutputMicros === null
  ) {
    return null;
  }

  return {
    sellInputMicros,
    sellOutputMicros,
    costInputMicros,
    costOutputMicros,
  };
}

/**
 * Replays the window's actual tokens at a candidate price. This is a
 * what-if, not a forecast: it uses settled volumes and the current cost, so a
 * stale or unknown cost produces no number rather than an optimistic one.
 */
export function projectPricingVolume(
  volume: HistoricalVolume | null | undefined,
  prices: { inputMicros: number; outputMicros: number },
  costs: { inputMicros: number; outputMicros: number },
  costKnown: boolean,
) {
  if (!volume || !costKnown) return null;

  const revenueMicros =
    computeTokenCostMicros(volume.inputTokens, prices.inputMicros) +
    computeTokenCostMicros(volume.outputTokens, prices.outputMicros);
  const costMicros =
    computeTokenCostMicros(volume.inputTokens, costs.inputMicros) +
    computeTokenCostMicros(volume.outputTokens, costs.outputMicros);
  const contributionMicros = revenueMicros - costMicros;

  return {
    revenueMicros,
    costMicros,
    contributionMicros,
    marginBps: marginBps(costMicros, revenueMicros),
  };
}
