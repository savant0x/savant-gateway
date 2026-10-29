/**
 * Pure unit economics for the gateway: what the catalog costs, what it sells
 * for, what the daily free allowance would cost if we had to buy it, and which
 * upstream is cheaper for a given model. Kept free of database and network
 * imports so the numbers can be tested and the document regenerated.
 *
 * All money values are integer micro-dollars (1 USD = 1_000_000).
 */

export type EconomicsGroup = "free" | "paid" | "subscription";

export type EconomicsRow = {
  id: string;
  group: EconomicsGroup;
  costInputMicros: number;
  costOutputMicros: number;
  sellInputMicros: number;
  sellOutputMicros: number;
  tokenWeight: number;
};

export type GroupEconomics = {
  group: EconomicsGroup;
  rows: number;
  priced: number;
  meanInputCostMicros: number | null;
  meanInputSellMicros: number | null;
  /** (sell - cost) / sell across priced rows, in basis points. */
  grossMarginBps: number | null;
};

export type CatalogEconomics = {
  rows: number;
  priced: number;
  freePool: number;
  subscriptionOnly: number;
  markupBps: number;
  cheapestPaidInputMicros: number | null;
  medianPaidInputMicros: number | null;
  priciestPaidInputMicros: number | null;
  grossMarginBpsOnPaid: number | null;
  groups: GroupEconomics[];
};

export type FreePoolEconomics = {
  dailyWeightedTokens: number;
  allocatableTokens: number;
  reserveTokens: number;
  monthlyAllocatableTokens: number;
  monthlyCostMicros: {
    cheapest: number | null;
    median: number | null;
    priciest: number | null;
  };
};

export type AlternativePrice = {
  provider: string;
  inputPer1MMicros: number;
  outputPer1MMicros: number;
};

export type PivotRow = {
  id: string;
  currentInputMicros: number;
  alternativeProvider: string;
  alternativeInputMicros: number;
  inputSavingBps: number | null;
  outputSavingBps: number | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function ratioBps(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;

  if (denominator <= 0) return null;

  return Math.round((numerator / denominator) * 10_000);
}

function groupEconomics(
  group: EconomicsGroup,
  rows: EconomicsRow[],
): GroupEconomics {
  const priced = rows.filter((row) => row.sellInputMicros > 0);
  const costed = priced.filter((row) => row.costInputMicros > 0);
  const totalSell = costed.reduce((sum, row) => sum + row.sellInputMicros, 0);
  const totalCost = costed.reduce((sum, row) => sum + row.costInputMicros, 0);

  return {
    group,
    rows: rows.length,
    priced: priced.length,
    meanInputCostMicros:
      costed.length === 0
        ? null
        : Math.round(
            costed.reduce((sum, row) => sum + row.costInputMicros, 0) /
              costed.length,
          ),
    meanInputSellMicros:
      priced.length === 0
        ? null
        : Math.round(
            priced.reduce((sum, row) => sum + row.sellInputMicros, 0) /
              priced.length,
          ),
    grossMarginBps:
      totalSell > 0 ? ratioBps(totalSell - totalCost, totalSell) : null,
  };
}

/**
 * Summarises one provider's catalog. "Priced" means the row has a sell rate; a
 * free-pool row bills nothing, and a subscription-only row is sold as access
 * rather than per token, so both are counted but never averaged into margin.
 */
export function catalogEconomics(
  rows: EconomicsRow[],
  markupBps: number,
): CatalogEconomics {
  const paid = rows.filter((row) => row.group === "paid");
  const paidCosts = paid
    .map((row) => row.costInputMicros)
    .filter((value) => value > 0);
  const costs = [...paidCosts].sort((a, b) => a - b);
  const sellTotal = paid.reduce((sum, row) => sum + row.sellInputMicros, 0);
  const costTotal = paid.reduce((sum, row) => sum + row.costInputMicros, 0);

  return {
    rows: rows.length,
    priced: rows.filter((row) => row.sellInputMicros > 0).length,
    freePool: rows.filter((row) => row.group === "free").length,
    subscriptionOnly: rows.filter((row) => row.group === "subscription").length,
    markupBps,
    cheapestPaidInputMicros: costs.length > 0 ? costs[0] : null,
    medianPaidInputMicros: median(costs),
    priciestPaidInputMicros: costs.length > 0 ? costs[costs.length - 1] : null,
    grossMarginBpsOnPaid:
      sellTotal > 0 ? ratioBps(sellTotal - costTotal, sellTotal) : null,
    groups: (["free", "paid", "subscription"] as const).map((group) =>
      groupEconomics(
        group,
        rows.filter((row) => row.group === group),
      ),
    ),
  };
}

function costOfMicros(
  tokens: number,
  per1MMicros: number | null,
): number | null {
  if (per1MMicros === null || !Number.isFinite(per1MMicros)) return null;
  if (!Number.isFinite(tokens) || tokens <= 0) return null;

  return Math.round((tokens * per1MMicros) / 1_000_000);
}

/**
 * The daily allowance is expressed in weighted tokens: a row's weight multiplies
 * the tokens it consumes. The share is a basis-point fraction of the pool that
 * accounts may draw on; the remainder is the reserve held back for bursts.
 */
export function freePoolEconomics(input: {
  dailyWeightedTokens: number;
  shareBps: number;
  /** USD micros per 1M weighted tokens, for a cheap, typical, and worst row. */
  per1MMicros: {
    cheapest: number | null;
    median: number | null;
    priciest: number | null;
  };
}): FreePoolEconomics {
  const daily = Math.max(0, Math.round(input.dailyWeightedTokens));
  const shareBps = Math.min(10_000, Math.max(0, Math.round(input.shareBps)));
  const allocatable = Math.round((daily * shareBps) / 10_000);
  const monthly = allocatable * 30;

  return {
    dailyWeightedTokens: daily,
    allocatableTokens: allocatable,
    reserveTokens: daily - allocatable,
    monthlyAllocatableTokens: monthly,
    monthlyCostMicros: {
      cheapest: costOfMicros(monthly, input.per1MMicros.cheapest),
      median: costOfMicros(monthly, input.per1MMicros.median),
      priciest: costOfMicros(monthly, input.per1MMicros.priciest),
    },
  };
}

/**
 * Compares our current upstream cost with each alternative provider's published
 * rate for the same upstream id. Ids without a published counterpart are
 * skipped rather than estimated, and a row is reported only when the
 * alternative is cheaper on input, because that is the pivot decision.
 */
export function providerPivot(
  ours: Array<{
    id: string;
    costInputMicros: number;
    costOutputMicros: number;
  }>,
  alternatives: Record<string, AlternativePrice>,
): PivotRow[] {
  const rows: PivotRow[] = [];

  for (const row of ours) {
    const alternative = alternatives[row.id];

    if (!alternative) continue;
    if (alternative.inputPer1MMicros >= row.costInputMicros) continue;

    rows.push({
      id: row.id,
      currentInputMicros: row.costInputMicros,
      alternativeProvider: alternative.provider,
      alternativeInputMicros: alternative.inputPer1MMicros,
      inputSavingBps: ratioBps(
        row.costInputMicros - alternative.inputPer1MMicros,
        row.costInputMicros,
      ),
      outputSavingBps: ratioBps(
        row.costOutputMicros - alternative.outputPer1MMicros,
        row.costOutputMicros,
      ),
    });
  }

  return rows.sort((a, b) => (b.inputSavingBps ?? 0) - (a.inputSavingBps ?? 0));
}
