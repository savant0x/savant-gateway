import type { Metadata } from "next";

import Link from "next/link";

import { AnalyticsChart } from "@/components/admin/analytics-chart";
import { AnalyticsModels } from "@/components/admin/analytics-models";
import { StatCard } from "@/components/dashboard/chips";
import {
  formatCompact,
  formatMarginPercent,
  formatMicros,
  formatNumber,
  formatRatePercent,
  formatSignedMicros,
} from "@/components/dashboard/format";
import {
  ANALYTICS_RANGES,
  getAnalyticsData,
  normalizeAnalyticsRange,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin analytics",
  robots: { index: false, follow: false },
};

const RANGE_LABELS: Record<number, string> = {
  7: "7 days",
  30: "30 days",
  90: "90 days",
};

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawRange = Array.isArray(params.range) ? params.range[0] : params.range;
  const range = normalizeAnalyticsRange(rawRange);
  const data = getAnalyticsData(range);
  const { totals } = data;
  const marginBps =
    totals.chargedMicros > 0
      ? Math.round((totals.marginMicros / totals.chargedMicros) * 10_000)
      : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Analytics
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Revenue, cost, and margin
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Every settled request writes charged revenue and upstream cost to
            the same row. Free calls record zero revenue and zero marginal cost,
            but still count as requests and tokens.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ANALYTICS_RANGES.map((days) => (
            <Link
              key={days}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                range === days
                  ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                  : "border-black/10 bg-surface text-muted hover:text-foreground dark:border-white/10"
              }`}
              href={`/admin/analytics?range=${days}`}
            >
              {RANGE_LABELS[days]}
            </Link>
          ))}
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          detail="charged to tenant credit"
          icon="fa-sack-dollar"
          label="Revenue"
          value={formatMicros(totals.chargedMicros)}
        />
        <StatCard
          detail="synced upstream price at call time"
          icon="fa-server"
          label="Upstream cost"
          value={formatMicros(totals.costMicros)}
        />
        <StatCard
          detail={`${formatMarginPercent(marginBps)} gross margin`}
          icon="fa-chart-pie"
          label="Gross profit"
          value={formatSignedMicros(totals.marginMicros)}
        />
        <StatCard
          detail={`${formatNumber(totals.okRequests)} ok · ${formatNumber(totals.errorRequests)} failed`}
          icon="fa-signal"
          label="Error rate"
          value={formatRatePercent(totals.errorRateBps)}
        />
        <StatCard
          detail={`${RANGE_LABELS[range]} of settled usage`}
          icon="fa-wave-square"
          label="Requests"
          value={formatNumber(totals.requests)}
        />
        <StatCard
          detail={`${formatCompact(totals.inputTokens)} in · ${formatCompact(totals.outputTokens)} out`}
          icon="fa-arrow-right-arrow-left"
          label="Tokens"
          value={formatCompact(totals.inputTokens + totals.outputTokens)}
        />
        <StatCard
          detail={`${formatNumber(totals.maxLatencyMs)} ms peak`}
          icon="fa-stopwatch"
          label="Avg latency"
          value={`${formatNumber(totals.averageLatencyMs)} ms`}
        />
        <StatCard
          detail="charged revenue ÷ upstream cost view"
          icon="fa-percent"
          label="Margin"
          value={formatMarginPercent(marginBps)}
        />
      </section>

      {totals.requests === 0 ? (
        <p className="rounded-2xl border border-dashed border-black/15 bg-surface p-5 text-sm text-muted dark:border-white/15">
          <i aria-hidden className="fa-solid fa-circle-info mr-2 text-accent" />
          No usage in this range. Sync the provider, fund the tenant, and run a
          request; the page reads the same rows the gateway settles.
        </p>
      ) : null}

      <AnalyticsChart series={data.series} />

      <AnalyticsModels models={data.models} />

      <section className="grid gap-4 text-xs text-muted sm:grid-cols-3">
        <div className="rounded-xl border border-black/10 bg-surface p-4 dark:border-white/10">
          <p className="font-medium text-foreground">Revenue</p>
          <p className="mt-1 leading-5">
            Actual debit after settlement. The pre-flight hold is admission
            control, not a price ceiling; reported usage is what gets charged.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface p-4 dark:border-white/10">
          <p className="font-medium text-foreground">Cost</p>
          <p className="mt-1 leading-5">
            Computed from the model&apos;s synced upstream price at the time of
            the call and stored on the usage row.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface p-4 dark:border-white/10">
          <p className="font-medium text-foreground">Estimates</p>
          <p className="mt-1 leading-5">
            If the provider omits usage, tokens are estimated from text length
            and the row is flagged estimated in storage.
          </p>
        </div>
      </section>
    </>
  );
}
