import type { CohortWindow, EconomicsRange, FreeCohort } from "@/lib/economics";

import Link from "next/link";

import {
  formatCalendarDay,
  formatNumber,
  formatRatePercent,
} from "@/components/dashboard/format";

function link(
  range: EconomicsRange,
  cohort: CohortWindow,
  observation: CohortWindow,
) {
  return `/admin/economics?range=${range}&cohort=${cohort}&observation=${observation}`;
}

export function FreeCohortPanel({
  cohort,
  range,
  cohortWindow,
  observationWindow,
}: {
  cohort: FreeCohort;
  range: EconomicsRange;
  cohortWindow: CohortWindow;
  observationWindow: CohortWindow;
}) {
  const metrics = [
    {
      label: "Eligible signups",
      value: formatNumber(cohort.eligibleSignups),
      detail: "joined in the cohort window",
    },
    {
      label: "First free use",
      value: formatNumber(cohort.withFirstFree),
      detail: "observed inside the window",
    },
    {
      label: "Free → paid",
      value:
        cohort.freeToPaidBps === null
          ? "—"
          : formatRatePercent(cohort.freeToPaidBps),
      detail: `${formatNumber(cohort.convertedAfterFree)} converted after first free use`,
    },
    {
      label: "Signup → paid",
      value:
        cohort.signupToPaidBps === null
          ? "—"
          : formatRatePercent(cohort.signupToPaidBps),
      detail: "includes paid without a free event",
    },
    {
      label: "Unknown history",
      value: formatNumber(cohort.unknownHistory),
      detail: "no recorded activity in the window",
    },
    {
      label: "Paid without free",
      value: formatNumber(cohort.paidWithoutFree),
      detail: "cannot be called free-tier conversion",
    },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-black/10 bg-surface dark:border-white/10">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 p-5 dark:border-white/10">
        <div>
          <h2 className="text-sm font-semibold">Free-tier cohorts</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
            Signups from {formatCalendarDay(cohort.cohortStart)} to{" "}
            {formatCalendarDay(cohort.cohortEnd)}, each observed for{" "}
            {cohort.observationDays} days after signup. This reports an observed
            sequence, not acquisition causality.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[7, 30, 90].map((days) => (
            <Link
              key={days}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${
                cohortWindow === days
                  ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                  : "border-black/10 text-muted hover:text-foreground dark:border-white/10"
              }`}
              href={link(range, days as CohortWindow, observationWindow)}
            >
              {days}d cohort
            </Link>
          ))}
          {[7, 30, 90].map((days) => (
            <Link
              key={`obs-${days}`}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${
                observationWindow === days
                  ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                  : "border-black/10 text-muted hover:text-foreground dark:border-white/10"
              }`}
              href={link(range, cohortWindow, days as CohortWindow)}
            >
              {days}d observe
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-black/10 px-4 py-3 dark:border-white/10"
          >
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">
              {metric.label}
            </p>
            <p className="mt-1 text-xl font-semibold">{metric.value}</p>
            <p className="mt-1 text-[11px] leading-4 text-muted">
              {metric.detail}
            </p>
          </div>
        ))}
      </div>

      <p className="border-t border-black/10 px-5 py-3 text-[11px] leading-5 text-muted dark:border-white/10">
        Rates use the displayed denominator. A signup with no recorded usage,
        top-up or subscription in its observation window is counted as unknown
        history rather than assumed not to have converted. Late events can
        change a cohort retrospectively inside the stated window.
      </p>
    </section>
  );
}
