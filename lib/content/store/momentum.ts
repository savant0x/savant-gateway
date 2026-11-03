import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type {
  MomentumEntry,
  MomentumMetric,
  MomentumMode,
  MomentumWindowHours,
  MetricCounts,
} from "../momentum.ts";

import { metricValue, momentumDelta, rankMomentum } from "../momentum.ts";

import { ITEM_COLUMNS, type ItemRow, toItem } from "./item-rows.ts";
import { numberOrZero } from "./item-writes.ts";

/** Retention bound for momentum history; 90 days is deliberately generous. */
export async function pruneMetricSnapshots(
  db: PostgresDatabase,
  now = new Date(),
  days = 90,
): Promise<void> {
  const cutoff = new Date(
    now.getTime() - Math.max(1, Math.trunc(days)) * 24 * 60 * 60 * 1000,
  ).toISOString();

  await db
    .prepare("DELETE FROM content.metric_snapshots WHERE captured_at < ?")
    .run(cutoff);
}

const MOMENTUM_COLUMNS: Record<MomentumMetric, string> = {
  views: "views",
  likes: "likes",
  comments: "youtube_comments",
  stars: "stars",
};

type MomentumRow = ItemRow & {
  momentum_captured_at: string;
  momentum_baseline_at: string;
  latest_views: number | string;
  latest_likes: number | string;
  latest_comments: number | string;
  latest_stars: number | string;
  baseline_views: number | string;
  baseline_likes: number | string;
  baseline_comments: number | string;
  baseline_stars: number | string;
};

/**
 * The baseline is the latest snapshot at or before the window start; the latest
 * is the newest snapshot overall. An item whose newest snapshot is before the
 * window has no activity and is excluded, as is an item with no baseline.
 */
export async function listMomentum(
  db: PostgresDatabase,
  options: {
    metric: MomentumMetric;
    windowHours: MomentumWindowHours;
    mode: MomentumMode;
    limit?: number;
    now?: Date;
  },
): Promise<MomentumEntry[]> {
  const now = options.now ?? new Date();
  const end = now.toISOString();
  const start = new Date(
    now.getTime() - options.windowHours * 60 * 60 * 1000,
  ).toISOString();
  const column = MOMENTUM_COLUMNS[options.metric];
  const rows = await db
    .prepare(
      `WITH latest AS (
         SELECT DISTINCT ON (item_id)
                item_id, captured_at, views, likes, youtube_comments, stars
           FROM content.metric_snapshots
          WHERE captured_at <= ?
          ORDER BY item_id, captured_at DESC
       ), baseline AS (
         SELECT DISTINCT ON (item_id)
                item_id, captured_at, views, likes, youtube_comments, stars
           FROM content.metric_snapshots
          WHERE captured_at <= ?
          ORDER BY item_id, captured_at DESC
       )
       SELECT ${ITEM_COLUMNS},
              l.captured_at AS momentum_captured_at,
              b.captured_at AS momentum_baseline_at,
              l.views AS latest_views,
              l.likes AS latest_likes,
              l.youtube_comments AS latest_comments,
              l.stars AS latest_stars,
              b.views AS baseline_views,
              b.likes AS baseline_likes,
              b.youtube_comments AS baseline_comments,
              b.stars AS baseline_stars,
              (l.${column} - b.${column}) AS momentum_delta
         FROM latest l
         JOIN baseline b ON b.item_id = l.item_id
         JOIN content.items i ON i.id = l.item_id
         JOIN content.sources s ON s.id = i.source_id
        WHERE l.captured_at > ?
        LIMIT 500`,
    )
    .all<MomentumRow>(end, start, start);
  const entries = rows.map((row) => {
    const latest: MetricCounts = {
      views: numberOrZero(row.latest_views),
      likes: numberOrZero(row.latest_likes),
      comments: numberOrZero(row.latest_comments),
      stars: numberOrZero(row.latest_stars),
    };
    const baseline: MetricCounts = {
      views: numberOrZero(row.baseline_views),
      likes: numberOrZero(row.baseline_likes),
      comments: numberOrZero(row.baseline_comments),
      stars: numberOrZero(row.baseline_stars),
    };

    return {
      item: toItem(row),
      metric: options.metric,
      delta: momentumDelta(options.metric, baseline, latest),
      current: metricValue(latest, options.metric),
      baseline: metricValue(baseline, options.metric),
      capturedAt: row.momentum_captured_at,
      baselineAt: row.momentum_baseline_at,
    };
  });

  return rankMomentum(entries, options.mode, options.limit ?? 10);
}
