import type { AdminModelSummary } from "@/lib/types";
import type { PricingDecision } from "@/lib/storage/store/pricing-decisions.ts";

import { formatDay, formatPricePer1M } from "@/components/dashboard/format";
import { StatePanel } from "@/components/ui/state-panel";
import { microsToPrice } from "@/lib/pricing";
import {
  marginBuckets,
  priceHistorySeries,
  routeMix,
} from "@/lib/pricing-chart-data";

function Bar({
  label,
  value,
  max,
  detail,
  tone = "cyan",
}: {
  label: string;
  value: number;
  max: number;
  detail: string;
  tone?: "cyan" | "emerald" | "danger";
}) {
  const width = max <= 0 ? 0 : Math.max(2, (value / max) * 100);
  const color =
    tone === "danger"
      ? "bg-danger/80"
      : tone === "emerald"
        ? "bg-emerald-400/80"
        : "bg-cyan-400/80";

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-[11px]">
        <span className="truncate text-foreground">{label}</span>
        <span className="shrink-0 text-muted">{detail}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 dark:border-white/10">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function PricingChart({
  models,
  decisions,
}: {
  models: AdminModelSummary[];
  decisions: PricingDecision[];
}) {
  const buckets = marginBuckets(models);
  const history = priceHistorySeries(decisions);
  const mix = routeMix(models);
  const maxBucket = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const maxHistory = Math.max(
    1,
    ...history.map((point) => point.averageInputMicros),
  );
  const maxMix = Math.max(1, ...mix.map((entry) => entry.models));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel
        description="Paid catalog rows by blended margin for 1M input + 1M output at today's cost and sell prices."
        title="Margin distribution"
      >
        {buckets.every((bucket) => bucket.count === 0) ? (
          <StatePanel
            description="No paid catalog row has both a cost and a sell price yet."
            state="empty"
            title="No margin data."
          />
        ) : (
          <div className="space-y-3">
            {buckets.map((bucket) => (
              <Bar
                key={bucket.label}
                detail={`${bucket.count} rows`}
                label={bucket.label}
                max={maxBucket}
                tone={bucket.negative ? "danger" : "cyan"}
                value={bucket.count}
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel
        description="Average approved sell price per UTC day. One bar is one day with at least one approval, never an interpolated line."
        title="Approved price history"
      >
        {history.length === 0 ? (
          <StatePanel
            description="No price has been approved through the recommendation control yet. Manual edits also record an audit row."
            state="empty"
            title="No price history."
          />
        ) : (
          <div className="space-y-3">
            {history.slice(-8).map((point) => (
              <Bar
                key={point.date}
                detail={`${formatPricePer1M(microsToPrice(point.averageInputMicros))} in · ${point.changes} change${point.changes === 1 ? "" : "s"}`}
                label={formatDay(point.date)}
                max={maxHistory}
                tone="emerald"
                value={point.averageInputMicros}
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel
        description="Catalog rows per provider. A row counts as serving when its own provider is the published route."
        title="Serving route mix"
      >
        {mix.length === 0 ? (
          <StatePanel
            description="Sync a provider to populate the catalog."
            state="empty"
            title="No catalog rows."
          />
        ) : (
          <div className="space-y-3">
            {mix.map((entry) => (
              <Bar
                key={entry.provider}
                detail={`${entry.served}/${entry.models} serving`}
                label={entry.provider}
                max={maxMix}
                value={entry.models}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
