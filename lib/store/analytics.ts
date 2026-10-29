import "server-only";

import type {
  AnalyticsData,
  AnalyticsModel,
  AnalyticsPoint,
  AnalyticsTotals,
} from "../types";

import { db } from "../db";

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export function normalizeAnalyticsRange(value: string | undefined | null) {
  const parsed = Number(value);

  return ANALYTICS_RANGES.includes(parsed as AnalyticsRange)
    ? (parsed as AnalyticsRange)
    : 30;
}

type TotalsRow = {
  requests: number;
  ok_requests: number;
  input_tokens: number;
  output_tokens: number;
  charged_micros: number;
  cost_micros: number;
  average_latency_ms: number;
  max_latency_ms: number;
};

type PointRow = {
  day: string;
  requests: number;
  tokens: number;
  charged_micros: number;
  cost_micros: number;
};

type ModelRow = {
  model_id: string | null;
  model_name: string | null;
  provider: string | null;
  requests: number;
  tokens: number;
  charged_micros: number;
  cost_micros: number;
};

function dayKeys(days: number) {
  const now = new Date();
  const keys: string[] = [];

  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - index,
      ),
    );

    keys.push(day.toISOString().slice(0, 10));
  }

  return keys;
}

export function getAnalyticsData(rangeDays: AnalyticsRange): AnalyticsData {
  const since = `-${rangeDays} days`;

  const totalsRow = db
    .prepare(
      `SELECT
         COUNT(*) AS requests,
         COALESCE(SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END), 0) AS ok_requests,
         COALESCE(SUM(input_tokens), 0) AS input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(SUM(charged_micros), 0) AS charged_micros,
         COALESCE(SUM(cost_micros), 0) AS cost_micros,
         COALESCE(AVG(latency_ms), 0) AS average_latency_ms,
         COALESCE(MAX(latency_ms), 0) AS max_latency_ms
       FROM usage_events
       WHERE datetime(created_at) >= datetime('now', ?)`,
    )
    .get(since) as TotalsRow;

  const pointRows = db
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at) AS day,
              COUNT(*) AS requests,
              COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
              COALESCE(SUM(charged_micros), 0) AS charged_micros,
              COALESCE(SUM(cost_micros), 0) AS cost_micros
       FROM usage_events
       WHERE datetime(created_at) >= datetime('now', ?)
       GROUP BY day
       ORDER BY day ASC`,
    )
    .all(since) as PointRow[];

  const modelRows = db
    .prepare(
      `SELECT u.model_id AS model_id,
              m.name AS model_name,
              m.provider AS provider,
              COUNT(*) AS requests,
              COALESCE(SUM(u.input_tokens + u.output_tokens), 0) AS tokens,
              COALESCE(SUM(u.charged_micros), 0) AS charged_micros,
              COALESCE(SUM(u.cost_micros), 0) AS cost_micros
       FROM usage_events u
       LEFT JOIN models m ON m.id = u.model_id
       WHERE datetime(u.created_at) >= datetime('now', ?)
       GROUP BY u.model_id
       ORDER BY charged_micros DESC, requests DESC
       LIMIT 12`,
    )
    .all(since) as ModelRow[];

  const byDay = new Map(pointRows.map((row) => [row.day, row]));

  const series: AnalyticsPoint[] = dayKeys(rangeDays).map((date) => {
    const row = byDay.get(date);

    return {
      date,
      requests: row?.requests ?? 0,
      tokens: row?.tokens ?? 0,
      chargedMicros: row?.charged_micros ?? 0,
      costMicros: row?.cost_micros ?? 0,
    };
  });

  const errorRequests = Math.max(0, totalsRow.requests - totalsRow.ok_requests);
  const totals: AnalyticsTotals = {
    requests: totalsRow.requests,
    okRequests: totalsRow.ok_requests,
    errorRequests,
    inputTokens: totalsRow.input_tokens,
    outputTokens: totalsRow.output_tokens,
    chargedMicros: totalsRow.charged_micros,
    costMicros: totalsRow.cost_micros,
    marginMicros: totalsRow.charged_micros - totalsRow.cost_micros,
    averageLatencyMs: Math.round(totalsRow.average_latency_ms),
    maxLatencyMs: totalsRow.max_latency_ms,
    errorRateBps:
      totalsRow.requests === 0
        ? 0
        : Math.round((errorRequests / totalsRow.requests) * 10_000),
  };

  const models: AnalyticsModel[] = modelRows.map((row) => ({
    modelId: row.model_id ?? "unknown",
    modelName: row.model_name ?? row.model_id ?? "Unknown model",
    provider: row.provider ?? "—",
    requests: row.requests,
    tokens: row.tokens,
    chargedMicros: row.charged_micros,
    costMicros: row.cost_micros,
  }));

  return { rangeDays, totals, series, models };
}
