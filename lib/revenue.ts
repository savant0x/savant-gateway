import type { PlanInterval } from "./types";

/**
 * Normalizes a plan price snapshot to a monthly run-rate in micro-dollars.
 * Manual and past-due subscriptions are excluded by the caller, not here.
 */
export function monthlyRecurringMicros(
  priceMicros: number,
  interval: PlanInterval,
): number {
  if (!Number.isFinite(priceMicros) || priceMicros <= 0) return 0;

  return interval === "year"
    ? Math.round(priceMicros / 12)
    : Math.round(priceMicros);
}

/** Gross margin in basis points, or null when there is no revenue base. */
export function grossMarginBps(
  revenueMicros: number,
  costMicros: number,
): number | null {
  if (!Number.isFinite(revenueMicros) || revenueMicros <= 0) return null;
  if (!Number.isFinite(costMicros)) return null;

  return Math.round(((revenueMicros - costMicros) / revenueMicros) * 10_000);
}
