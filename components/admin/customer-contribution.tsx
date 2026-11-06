import type { CustomerContributionPage, EconomicsRange } from "@/lib/economics";

import Link from "next/link";

import {
  formatCalendarDay,
  formatMicros,
  formatNumber,
} from "@/components/dashboard/format";
import { StatePanel } from "@/components/ui/state-panel";

const RANGE_LABELS: Record<EconomicsRange, string> = {
  30: "30 days",
  90: "90 days",
  365: "1 year",
};

function pageHref(range: EconomicsRange, page: number) {
  return `/admin/economics?range=${range}&page=${page}`;
}

export function CustomerContributionTable({
  data,
}: {
  data: CustomerContributionPage;
}) {
  const first = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const last = Math.min(data.total, data.page * data.pageSize);

  return (
    <section className="overflow-hidden rounded-2xl border border-black/10 bg-surface dark:border-white/10">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 p-5 dark:border-white/10">
        <div>
          <h2 className="text-sm font-semibold">Customer contribution</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
            Settled credit charges plus observed paid-plan invoices, less
            recorded upstream cost. Top-up principal is shown separately and is
            never counted as revenue. Fees, refunds and free opportunity cost
            are unavailable, not zero.
          </p>
        </div>
        <div className="flex gap-1.5">
          {(Object.keys(RANGE_LABELS) as string[]).map((key) => {
            const range = Number(key) as EconomicsRange;

            return (
              <Link
                key={key}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${
                  data.rangeDays === range
                    ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                    : "border-black/10 text-muted hover:text-foreground dark:border-white/10"
                }`}
                href={pageHref(range, 1)}
              >
                {RANGE_LABELS[range]}
              </Link>
            );
          })}
        </div>
      </div>

      {data.rows.length === 0 ? (
        <StatePanel
          className="m-5"
          description="No customer has settled usage, a paid plan invoice or a paid top-up in this range. The table does not infer a customer from an anonymous usage row."
          state="empty"
          title="No customer activity in this range."
        />
      ) : (
        <div className="scroll-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th className="text-right">Credit revenue</th>
                <th className="text-right">Plan cash</th>
                <th className="text-right">Recorded cost</th>
                <th className="text-right">Contribution</th>
                <th className="text-right">Top-up principal</th>
                <th className="text-right">Requests</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.userId}>
                  <td>
                    <div className="font-medium">{row.name}</div>
                    <div className="text-[11px] text-muted">
                      {row.email} · joined {formatCalendarDay(row.createdAt)}
                    </div>
                  </td>
                  <td className="text-right">
                    {formatMicros(row.creditChargedMicros)}
                  </td>
                  <td className="text-right">
                    {formatMicros(row.planCashMicros)}
                    <div className="text-[11px] text-muted">
                      {formatNumber(row.paidInvoiceCount)} invoices
                    </div>
                  </td>
                  <td className="text-right">
                    {formatMicros(row.totalCostMicros)}
                    <div className="text-[11px] text-muted">
                      credit {formatMicros(row.creditCostMicros)} · plan{" "}
                      {formatMicros(row.subscriptionCostMicros)} · free{" "}
                      {formatMicros(row.freeCostMicros)}
                    </div>
                  </td>
                  <td className="text-right">
                    <span
                      className={
                        row.contributionMicros >= 0
                          ? "text-success"
                          : "text-danger"
                      }
                    >
                      {formatMicros(row.contributionMicros)}
                    </span>
                    <div className="text-[11px] text-muted">
                      credit {formatMicros(row.creditContributionMicros)}
                    </div>
                  </td>
                  <td className="text-right text-muted">
                    {formatMicros(row.topupPrincipalMicros)}
                  </td>
                  <td className="text-right text-muted">
                    {formatNumber(row.requestCount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-5 py-3 text-[11px] text-muted dark:border-white/10">
        <span>
          {data.total === 0
            ? "No rows"
            : `${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(data.total)}`}
        </span>
        <span>
          Coverage: costs are recorded estimates; fees and refunds are
          unavailable. Plan cash is dated at the invoice, not accrued.
        </span>
        <span className="flex gap-2">
          {data.page > 1 ? (
            <Link
              className="rounded border border-black/10 px-2 py-1 hover:text-foreground dark:border-white/10"
              href={pageHref(data.rangeDays, data.page - 1)}
            >
              Previous
            </Link>
          ) : null}
          {data.page < data.pageCount ? (
            <Link
              className="rounded border border-black/10 px-2 py-1 hover:text-foreground dark:border-white/10"
              href={pageHref(data.rangeDays, data.page + 1)}
            >
              Next
            </Link>
          ) : null}
        </span>
      </div>
    </section>
  );
}
