import type { ContentItem } from "./types.ts";

/**
 * Momentum is a measured change between two stored source observations
 * (FID-2026-1102-101). It is never a blended score: every ranking names one
 * metric, one window and the source-reported counts. Gateway traffic is not an
 * input.
 */

export const MOMENTUM_METRICS = [
  "views",
  "likes",
  "comments",
  "stars",
] as const;

export type MomentumMetric = (typeof MOMENTUM_METRICS)[number];

export const MOMENTUM_WINDOWS_HOURS = [24, 72, 168] as const;

export type MomentumWindowHours = (typeof MOMENTUM_WINDOWS_HOURS)[number];

export type MomentumMode = "rising" | "movers";

export type MetricCounts = {
  views: number;
  likes: number;
  comments: number;
  stars: number;
};

export type MomentumEntry = {
  item: ContentItem;
  metric: MomentumMetric;
  delta: number;
  current: number;
  baseline: number;
  capturedAt: string;
  baselineAt: string;
};

export const MOMENTUM_METRIC_LABELS: Record<MomentumMetric, string> = {
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  stars: "Repo stars",
};

export const MOMENTUM_MODE_LABELS: Record<MomentumMode, string> = {
  rising: "Rising",
  movers: "Top movers",
};

export function isMomentumMetric(value: unknown): value is MomentumMetric {
  return (
    typeof value === "string" &&
    (MOMENTUM_METRICS as readonly string[]).includes(value)
  );
}

export function isMomentumWindow(value: unknown): value is MomentumWindowHours {
  return (
    typeof value === "number" &&
    (MOMENTUM_WINDOWS_HOURS as readonly number[]).includes(value)
  );
}

export function normalizeMomentumMetric(
  raw: string | undefined,
): MomentumMetric {
  return isMomentumMetric(raw) ? raw : "views";
}

export function normalizeMomentumWindow(
  raw: string | undefined,
): MomentumWindowHours {
  const hours = Number(raw);

  return isMomentumWindow(hours) ? hours : 24;
}

export function metricValue(
  counts: MetricCounts,
  metric: MomentumMetric,
): number {
  return counts[metric];
}

export function momentumDelta(
  metric: MomentumMetric,
  baseline: MetricCounts,
  latest: MetricCounts,
): number {
  return metricValue(latest, metric) - metricValue(baseline, metric);
}

export function metricLabel(metric: MomentumMetric): string {
  return MOMENTUM_METRIC_LABELS[metric];
}

export function windowLabel(hours: MomentumWindowHours): string {
  return hours === 168 ? "7 days" : hours === 72 ? "3 days" : "24 hours";
}

export function momentumHref(
  mode: MomentumMode,
  metric: MomentumMetric,
  hours: MomentumWindowHours,
): string {
  return `/signal/${mode}?metric=${metric}&window=${hours}`;
}

/**
 * Rising keeps positive change only. Movers keeps the largest absolute change
 * in either direction. Missing measurements are excluded by the caller, not
 * ranked as zero.
 */
export function rankMomentum<T extends { delta: number; item: ContentItem }>(
  entries: T[],
  mode: MomentumMode,
  limit = 10,
): T[] {
  const usable = entries.filter((entry) =>
    mode === "rising" ? entry.delta > 0 : entry.delta !== 0,
  );

  return usable
    .slice()
    .sort((left, right) => {
      const leftRank = mode === "rising" ? left.delta : Math.abs(left.delta);
      const rightRank = mode === "rising" ? right.delta : Math.abs(right.delta);

      if (leftRank !== rightRank) return rightRank - leftRank;

      const titleOrder = left.item.title.localeCompare(right.item.title);

      return titleOrder !== 0
        ? titleOrder
        : left.item.id.localeCompare(right.item.id);
    })
    .slice(0, Math.min(50, Math.max(1, limit)));
}
