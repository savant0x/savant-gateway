import type { Metadata } from "next";

import { SubscriptionsPanel } from "@/components/admin/subscriptions-panel";
import { formatMicros, formatNumber } from "@/components/dashboard/format";
import {
  listCustomerSummaries,
  listPlans,
  listSubscriptionSummaries,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin subscriptions",
  robots: { index: false, follow: false },
};

export default function AdminSubscriptionsPage() {
  const subscriptions = listSubscriptionSummaries(200);
  const active = subscriptions.filter(
    (subscription) => subscription.status === "active",
  );
  const monthly = active.reduce(
    (total, subscription) =>
      total +
      (subscription.plan.interval === "month"
        ? subscription.plan.priceMicros
        : Math.round(subscription.plan.priceMicros / 12)),
    0,
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Subscriptions
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Entitlements and recurring access
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Every Stripe and manual subscription with its snapshotted plan,
            allowance usage, entitlement count, and latest invoice. Revocation
            is immediate; a plan edit never rewrites an existing purchase.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface px-3 py-2 text-xs text-muted dark:border-white/10">
          {formatNumber(subscriptions.length)} subscriptions · {active.length}{" "}
          active · {formatMicros(monthly)} monthly-equivalent
        </div>
      </div>

      <SubscriptionsPanel
        customers={listCustomerSummaries()}
        plans={listPlans()}
        subscriptions={subscriptions}
      />
    </>
  );
}
