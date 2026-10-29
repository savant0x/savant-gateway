import type { AnalyticsPlan } from "@/lib/types";

import { formatMicros, formatNumber } from "@/components/dashboard/format";

const INTERVAL_LABELS: Record<AnalyticsPlan["interval"], string> = {
  month: "Monthly",
  year: "Yearly",
};

export function AnalyticsPlans({ plans }: { plans: AnalyticsPlan[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-surface dark:border-white/10">
      <div className="border-b border-black/10 p-5 dark:border-white/10">
        <h2 className="text-sm font-semibold">Plan revenue and run-rate</h2>
        <p className="mt-1 text-xs text-muted">
          Paid invoices in the selected range. Subscriber counts and MRR are
          current.
        </p>
      </div>

      {plans.length === 0 ? (
        <p className="p-6 text-sm text-muted">
          No paid plan invoices or live subscriptions yet. Create a plan and
          grant or sell a subscription; this table reads the same invoice rows
          the Stripe webhook writes.
        </p>
      ) : (
        <div className="scroll-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Interval</th>
                <th className="text-right">Active</th>
                <th className="text-right">Past due</th>
                <th className="text-right">MRR</th>
                <th className="text-right">Paid invoices</th>
                <th className="text-right">Plan revenue</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={`${plan.planId}:${plan.interval}`}>
                  <td className="font-medium">{plan.planName}</td>
                  <td className="text-muted">
                    {INTERVAL_LABELS[plan.interval]}
                  </td>
                  <td className="text-right">
                    {formatNumber(plan.activeSubscribers)}
                  </td>
                  <td className="text-right text-muted">
                    {formatNumber(plan.pastDueSubscribers)}
                  </td>
                  <td className="text-right">{formatMicros(plan.mrrMicros)}</td>
                  <td className="text-right text-muted">
                    {formatNumber(plan.paidInvoiceCount)}
                  </td>
                  <td className="text-right">
                    {formatMicros(plan.planRevenueMicros)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-black/10 px-5 py-3 text-[11px] leading-5 text-muted dark:border-white/10">
        MRR normalizes yearly prices to a month. It excludes manual grants,
        past-due subscriptions, and subscriptions set to cancel at period end.
        Plan revenue is cash at <span className="mono">paid_at</span>, not
        accrued across the service period.
      </p>
    </div>
  );
}
