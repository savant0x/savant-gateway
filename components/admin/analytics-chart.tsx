import type { AnalyticsPoint } from "@/lib/types";

import { formatDay, formatMicros } from "@/components/dashboard/format";

function barHeight(value: number, max: number) {
  if (value <= 0 || max <= 0) return "0%";

  return `${Math.max(1.5, (value / max) * 100)}%`;
}

export function AnalyticsChart({ series }: { series: AnalyticsPoint[] }) {
  const max = Math.max(
    1,
    ...series.map((point) =>
      Math.max(point.chargedMicros, point.planRevenueMicros, point.costMicros),
    ),
  );
  const hasData = series.some(
    (point) =>
      point.chargedMicros > 0 ||
      point.planRevenueMicros > 0 ||
      point.costMicros > 0,
  );
  const labelIndexes = Array.from(
    new Set([0, Math.floor(series.length / 2), series.length - 1]),
  ).filter((index) => index >= 0 && index < series.length);

  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Daily money</h2>
          <p className="mt-1 text-xs text-muted">
            Credit and plan revenue against upstream cost per UTC day.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-cyan-400" />
            Credit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
            Plan
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-500" />
            Cost
          </span>
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <div className="flex h-48 flex-col justify-between py-0.5 text-right text-[10px] text-muted">
          <span>{formatMicros(max)}</span>
          <span>$0</span>
        </div>

        <div className="relative flex h-48 flex-1 items-end gap-[2px] border-b border-black/10 pb-0 dark:border-white/10">
          {series.map((point) => (
            <div
              key={point.date}
              className="group flex h-full flex-1 items-end justify-center gap-[1px]"
              title={`${point.date} · credit ${formatMicros(point.chargedMicros)} · plan ${formatMicros(point.planRevenueMicros)} · cost ${formatMicros(point.costMicros)} · ${point.requests} requests`}
            >
              <div
                className="w-full max-w-[5px] rounded-t-sm bg-cyan-400/90 transition-colors group-hover:bg-cyan-300"
                style={{ height: barHeight(point.chargedMicros, max) }}
              />
              <div
                className="w-full max-w-[5px] rounded-t-sm bg-emerald-400/90 transition-colors group-hover:bg-emerald-300"
                style={{ height: barHeight(point.planRevenueMicros, max) }}
              />
              <div
                className="w-full max-w-[5px] rounded-t-sm bg-slate-500/80 transition-colors group-hover:bg-slate-400"
                style={{ height: barHeight(point.costMicros, max) }}
              />
            </div>
          ))}

          {!hasData ? (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">
              No credit revenue, plan revenue, or cost in this range.
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex justify-between pl-14 text-[10px] text-muted">
        {labelIndexes.map((index) => (
          <span key={series[index]?.date ?? index}>
            {series[index] ? formatDay(series[index].date) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
