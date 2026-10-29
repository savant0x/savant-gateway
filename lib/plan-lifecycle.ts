import type { PlanInterval } from "./types";

/** Adds a calendar month/year while clamping to the last day of the month. */
export function addPlanInterval(
  start: Date,
  interval: PlanInterval,
  count = 1,
): Date {
  const end = new Date(start.getTime());

  if (interval === "month") {
    const day = end.getUTCDate();

    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + count);

    const lastDay = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
    ).getUTCDate();

    end.setUTCDate(Math.min(day, lastDay));
  } else {
    const month = end.getUTCMonth();
    const day = end.getUTCDate();

    end.setUTCDate(1);
    end.setUTCFullYear(end.getUTCFullYear() + count);
    end.setUTCMonth(month);

    const lastDay = new Date(
      Date.UTC(end.getUTCFullYear(), month + 1, 0),
    ).getUTCDate();

    end.setUTCDate(Math.min(day, lastDay));
  }

  return end;
}

export function intervalEndIso(
  startIso: string,
  interval: PlanInterval,
  count = 1,
) {
  const start = new Date(startIso);

  if (Number.isNaN(start.getTime())) {
    throw new Error("Invalid period start.");
  }

  return addPlanInterval(start, interval, count).toISOString();
}

export function intervalLabel(interval: PlanInterval) {
  return interval === "month" ? "Monthly" : "Yearly";
}

export function planPriceUsd(priceMicros: number) {
  return priceMicros / 1_000_000;
}

export type StripeSubscriptionStatus =
  "active" | "canceled" | "expired" | "incomplete" | "past_due";

/** Maps Stripe lifecycle values onto the local subscription states. */
export function mapStripeSubscriptionStatus(
  status: string,
  cancelAtPeriodEnd = false,
  periodEnd = "",
  now = Date.now(),
): StripeSubscriptionStatus {
  if (status === "trialing" || status === "active") {
    const end = Date.parse(periodEnd);

    if (cancelAtPeriodEnd && Number.isFinite(end) && end <= now) {
      return "canceled";
    }

    return "active";
  }

  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled") return "canceled";
  if (status === "incomplete_expired") return "expired";
  if (status === "incomplete" || status === "paused") return "incomplete";

  return "past_due";
}

export function subscriptionBlocksCalls(status: string) {
  return status === "past_due";
}

export function subscriptionGrantsAccess(
  status: string,
  periodEnd: string,
  now = Date.now(),
) {
  if (status !== "active") return false;

  const end = Date.parse(periodEnd);

  return !Number.isFinite(end) || end > now;
}
