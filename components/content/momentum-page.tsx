import type {
  MomentumEntry,
  MomentumMode,
  MomentumMetric,
  MomentumWindowHours,
} from "@/lib/content/momentum";

import Link from "next/link";

import { ContentDisabled } from "@/components/content/content-disabled";
import { MomentumList } from "@/components/content/momentum-list";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import {
  MOMENTUM_METRICS,
  MOMENTUM_MODE_LABELS,
  MOMENTUM_WINDOWS_HOURS,
  metricLabel,
  momentumHref,
  normalizeMomentumMetric,
  normalizeMomentumWindow,
  windowLabel,
} from "@/lib/content/momentum";
import { contentEnabled } from "@/lib/content/policy";
import { listMomentum } from "@/lib/content/store/momentum";
import { getDatabase } from "@/lib/storage/runtime";

type Search = {
  metric?: string;
  window?: string;
};

function copy(mode: MomentumMode, metric: MomentumMetric, hours: number) {
  const label = metricLabel(metric).toLowerCase();
  const window = windowLabel(hours as MomentumWindowHours);

  return mode === "rising"
    ? `Pieces whose source-reported ${label} rose over the last ${window}.`
    : `Largest absolute change in ${label} over the last ${window}, in either direction.`;
}

export async function MomentumPage({
  mode,
  searchParams,
}: {
  mode: MomentumMode;
  searchParams: Promise<Search>;
}) {
  if (!contentEnabled()) {
    return (
      <div className="site-shell">
        <SiteHeader />
        <main>
          <ContentDisabled />
        </main>
        <SiteFooter />
      </div>
    );
  }

  const params = await searchParams;
  const metric = normalizeMomentumMetric(params.metric);
  const hours = normalizeMomentumWindow(params.window);
  let entries: MomentumEntry[] = [];
  let error: string | null = null;

  try {
    const db = await getDatabase();

    entries = await listMomentum(db, {
      metric,
      windowHours: hours,
      mode,
      limit: 12,
    });
  } catch (caught) {
    error =
      caught instanceof Error ? caught.message : "Storage is unavailable.";
  }

  return (
    <div className="site-shell">
      <SiteHeader />

      <main>
        <section className="hero-glow border-b border-white/10">
          <div className="mx-auto w-full max-w-[80rem] px-4 py-12 sm:px-6 lg:px-8">
            <Link
              className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-300 underline-offset-4 hover:underline"
              href="/signal"
            >
              ← Signal
            </Link>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
              {MOMENTUM_MODE_LABELS[mode]}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
              {copy(mode, metric, hours)}
            </p>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted">
              Counts come from the publishers&apos; feeds, never from gateway
              traffic. An item with one stored snapshot has no prior value and
              is excluded rather than shown as zero. Metrics are never blended
              into one score.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[80rem] px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.12em] text-muted">
                Metric
              </span>
              {MOMENTUM_METRICS.map((entry) => {
                const active = entry === metric;

                return (
                  <Link
                    key={entry}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      active
                        ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                        : "border-black/10 text-muted hover:text-foreground dark:border-white/10"
                    }`}
                    href={momentumHref(mode, entry, hours)}
                  >
                    {metricLabel(entry)}
                  </Link>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-[0.12em] text-muted">
                Window
              </span>
              {MOMENTUM_WINDOWS_HOURS.map((entry) => {
                const active = entry === hours;

                return (
                  <Link
                    key={entry}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      active
                        ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                        : "border-black/10 text-muted hover:text-foreground dark:border-white/10"
                    }`}
                    href={momentumHref(mode, metric, entry)}
                  >
                    {windowLabel(entry)}
                  </Link>
                );
              })}
            </div>
          </div>

          <nav
            aria-label="Signal rankings"
            className="mt-5 flex flex-wrap gap-4"
          >
            {(["rising", "movers"] as const).map((entry) => (
              <Link
                key={entry}
                aria-current={entry === mode ? "page" : undefined}
                className={`text-xs underline-offset-4 hover:underline ${
                  entry === mode ? "text-accent" : "text-muted"
                }`}
                href={momentumHref(entry, metric, hours)}
              >
                {MOMENTUM_MODE_LABELS[entry]}
              </Link>
            ))}
            <Link
              className="text-xs text-accent underline-offset-4 hover:underline"
              href="/signal/digest"
            >
              Today&apos;s digest →
            </Link>
          </nav>

          {error ? (
            <p className="mt-6 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              Content storage is unavailable: {error}
            </p>
          ) : entries.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-black/15 p-8 text-center dark:border-white/15">
              <p className="text-sm font-medium">
                No {metricLabel(metric).toLowerCase()} change has been measured
                in the last {windowLabel(hours)}.
              </p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted">
                A source must be fetched at least twice with a changed count
                before a delta exists. Check{" "}
                <Link
                  className="text-accent hover:underline"
                  href="/signal/status"
                >
                  source status
                </Link>{" "}
                to see whether feeds are current.
              </p>
            </div>
          ) : (
            <div className="mt-6">
              <MomentumList entries={entries} metric={metric} mode={mode} />
              <p className="mt-3 text-[11px] leading-5 text-muted">
                Comparison uses the newest stored observation at or before the
                window start and the newest observation now. A missing metric is
                not treated as an observed zero.
              </p>
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
