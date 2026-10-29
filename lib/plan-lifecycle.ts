import type Stripe from "stripe";
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

export type StripeSubscriptionSnapshot = {
  status: string;
  stripeCustomerId: string;
  /** Null when Stripe reported no period; never a plausible substitute. */
  periodStart: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

function epoch(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? new Date(value * 1000).toISOString()
    : null;
}

/** Reads period fields from either the subscription or its first item. */
export function readStripeSubscriptionSnapshot(
  subscription: Stripe.Subscription,
): StripeSubscriptionSnapshot {
  const raw = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
    cancel_at_period_end?: boolean;
    status?: string;
    customer?: string | { id: string };
    items?: {
      data?: Array<{
        current_period_start?: number;
        current_period_end?: number;
      }>;
    };
  };
  const item = raw.items?.data?.[0];
  const customer =
    typeof raw.customer === "string" ? raw.customer : (raw.customer?.id ?? "");

  return {
    status: raw.status ?? subscription.status,
    stripeCustomerId: customer,
    periodStart:
      epoch(raw.current_period_start) ?? epoch(item?.current_period_start),
    periodEnd: epoch(raw.current_period_end) ?? epoch(item?.current_period_end),
    cancelAtPeriodEnd: raw.cancel_at_period_end === true,
  };
}
