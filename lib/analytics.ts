import type {
  AnalyticsData,
  AnalyticsModel,
  AnalyticsPlan,
  AnalyticsPoint,
  AnalyticsTotals,
  PlanInterval,
} from "./types";
import type { DatabaseHandle } from "./schema/columns.ts";

import { monthlyRecurringMicros } from "./revenue.ts";

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
  family: string | null;
  requests: number;
  tokens: number;
  charged_micros: number;
  cost_micros: number;
};

type InvoicePointRow = {
  day: string;
  plan_revenue_micros: number;
};

type InvoicePlanRow = {
  plan_id: string;
  plan_name: string;
  interval: PlanInterval;
  paid_invoice_count: number;
  plan_revenue_micros: number;
};

type SubscriptionRow = {
  plan_id: string;
  plan_name: string;
  interval: PlanInterval;
  status: "active" | "past_due";
  source: "stripe" | "manual";
  price_micros: number;
  cancel_at_period_end: number;
};

function dayKeys(days: number, now: Date) {
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

function cutoffIso(now: Date, days: number) {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

function planKey(planId: string, interval: PlanInterval) {
  return `${planId}:${interval}`;
}

function planName(row: { plan_name: string | null }) {
  const value = row.plan_name?.trim();

  return value && value.length > 0 ? value : "Unknown plan";
}

function readPlanRows(
  database: DatabaseHandle,
  since: string,
): {
  plans: Map<string, AnalyticsPlan>;
  activeSubscribers: number;
  pastDueSubscribers: number;
  cancelingSubscribers: number;
  manualSubscribers: number;
  mrrMicros: number;
} {
  const rows = new Map<string, AnalyticsPlan>();

  const invoiceRows = database
    .prepare(
      `SELECT s.plan_id AS plan_id,
              COALESCE(MAX(p.name), MAX(s.plan_name_snapshot)) AS plan_name,
              s.interval_snapshot AS interval,
              COUNT(*) AS paid_invoice_count,
              COALESCE(SUM(i.amount_micros), 0) AS plan_revenue_micros
       FROM subscription_invoices i
       JOIN subscriptions s ON s.id = i.subscription_id
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE i.status = 'paid' AND i.currency = 'usd'
         AND datetime(COALESCE(i.paid_at, i.created_at)) >= datetime(?)
       GROUP BY s.plan_id, s.interval_snapshot
       ORDER BY plan_revenue_micros DESC, plan_name ASC`,
    )
    .all(since) as InvoicePlanRow[];

  for (const row of invoiceRows) {
    rows.set(planKey(row.plan_id, row.interval), {
      planId: row.plan_id,
      planName: planName(row),
      interval: row.interval,
      activeSubscribers: 0,
      pastDueSubscribers: 0,
      mrrMicros: 0,
      paidInvoiceCount: row.paid_invoice_count,
      planRevenueMicros: row.plan_revenue_micros,
    });
  }

  const subscriptions = database
    .prepare(
      `SELECT s.plan_id AS plan_id,
              COALESCE(p.name, s.plan_name_snapshot) AS plan_name,
              s.interval_snapshot AS interval,
              s.status AS status,
              s.source AS source,
              s.price_micros_snapshot AS price_micros,
              s.cancel_at_period_end AS cancel_at_period_end
       FROM subscriptions s
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE s.status IN ('active', 'past_due')
       ORDER BY datetime(s.created_at) ASC`,
    )
    .all() as SubscriptionRow[];

  let activeSubscribers = 0;
  let pastDueSubscribers = 0;
  let cancelingSubscribers = 0;
  let manualSubscribers = 0;
  let mrrMicros = 0;

  for (const row of subscriptions) {
    const key = planKey(row.plan_id, row.interval);
    const current = rows.get(key) ?? {
      planId: row.plan_id,
      planName: planName(row),
      interval: row.interval,
      activeSubscribers: 0,
      pastDueSubscribers: 0,
      mrrMicros: 0,
      paidInvoiceCount: 0,
      planRevenueMicros: 0,
    };

    current.planName = planName(row);

    if (row.status === "active") {
      current.activeSubscribers += 1;
      activeSubscribers += 1;

      if (row.cancel_at_period_end === 1) {
        cancelingSubscribers += 1;
      }

      if (row.source === "manual") {
        manualSubscribers += 1;
      } else if (row.cancel_at_period_end === 0) {
        const monthly = monthlyRecurringMicros(row.price_micros, row.interval);

        current.mrrMicros += monthly;
        mrrMicros += monthly;
      }
    } else {
      current.pastDueSubscribers += 1;
      pastDueSubscribers += 1;
    }

    rows.set(key, current);
  }

  return {
    plans: rows,
    activeSubscribers,
    pastDueSubscribers,
    cancelingSubscribers,
    manualSubscribers,
    mrrMicros,
  };
}

export function readAnalyticsData(
  database: DatabaseHandle,
  rangeDays: AnalyticsRange,
  now: Date = new Date(),
): AnalyticsData {
  const since = cutoffIso(now, rangeDays);

  const totalsRow = database
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
       WHERE datetime(created_at) >= datetime(?)`,
    )
    .get(since) as TotalsRow;

  const pointRows = database
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at) AS day,
              COUNT(*) AS requests,
              COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
              COALESCE(SUM(charged_micros), 0) AS charged_micros,
              COALESCE(SUM(cost_micros), 0) AS cost_micros
       FROM usage_events
       WHERE datetime(created_at) >= datetime(?)
       GROUP BY day
       ORDER BY day ASC`,
    )
    .all(since) as PointRow[];

  const modelRows = database
    .prepare(
      `SELECT u.model_id AS model_id,
              m.name AS model_name,
              m.provider AS family,
              COUNT(*) AS requests,
              COALESCE(SUM(u.input_tokens + u.output_tokens), 0) AS tokens,
              COALESCE(SUM(u.charged_micros), 0) AS charged_micros,
              COALESCE(SUM(u.cost_micros), 0) AS cost_micros
       FROM usage_events u
       LEFT JOIN models m ON m.id = u.model_id
       WHERE datetime(u.created_at) >= datetime(?)
       GROUP BY u.model_id
       ORDER BY charged_micros DESC, requests DESC
       LIMIT 12`,
    )
    .all(since) as ModelRow[];

  const invoicePointRows = database
    .prepare(
      `SELECT strftime('%Y-%m-%d', COALESCE(paid_at, created_at)) AS day,
              COALESCE(SUM(amount_micros), 0) AS plan_revenue_micros
       FROM subscription_invoices
       WHERE status = 'paid' AND currency = 'usd'
         AND datetime(COALESCE(paid_at, created_at)) >= datetime(?)
       GROUP BY day
       ORDER BY day ASC`,
    )
    .all(since) as InvoicePointRow[];

  const byDay = new Map(pointRows.map((row) => [row.day, row]));
  const invoiceByDay = new Map(
    invoicePointRows.map((row) => [row.day, row.plan_revenue_micros]),
  );

  const series: AnalyticsPoint[] = dayKeys(rangeDays, now).map((date) => {
    const row = byDay.get(date);

    return {
      date,
      requests: row?.requests ?? 0,
      tokens: row?.tokens ?? 0,
      chargedMicros: row?.charged_micros ?? 0,
      planRevenueMicros: invoiceByDay.get(date) ?? 0,
      costMicros: row?.cost_micros ?? 0,
    };
  });

  const planSummary = readPlanRows(database, since);
  const planRows = Array.from(planSummary.plans.values()).sort(
    (left, right) =>
      right.planRevenueMicros - left.planRevenueMicros ||
      right.mrrMicros - left.mrrMicros ||
      left.planName.localeCompare(right.planName),
  );

  const errorRequests = Math.max(0, totalsRow.requests - totalsRow.ok_requests);
  const planRevenueMicros = planRows.reduce(
    (total, plan) => total + plan.planRevenueMicros,
    0,
  );
  const paidInvoiceCount = planRows.reduce(
    (total, plan) => total + plan.paidInvoiceCount,
    0,
  );
  const totalRevenueMicros = totalsRow.charged_micros + planRevenueMicros;

  const totals: AnalyticsTotals = {
    requests: totalsRow.requests,
    okRequests: totalsRow.ok_requests,
    errorRequests,
    inputTokens: totalsRow.input_tokens,
    outputTokens: totalsRow.output_tokens,
    chargedMicros: totalsRow.charged_micros,
    planRevenueMicros,
    totalRevenueMicros,
    paidInvoiceCount,
    costMicros: totalsRow.cost_micros,
    marginMicros: totalsRow.charged_micros - totalsRow.cost_micros,
    totalMarginMicros: totalRevenueMicros - totalsRow.cost_micros,
    activeSubscribers: planSummary.activeSubscribers,
    pastDueSubscribers: planSummary.pastDueSubscribers,
    cancelingSubscribers: planSummary.cancelingSubscribers,
    manualSubscribers: planSummary.manualSubscribers,
    mrrMicros: planSummary.mrrMicros,
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
    family: row.family ?? "—",
    requests: row.requests,
    tokens: row.tokens,
    chargedMicros: row.charged_micros,
    costMicros: row.cost_micros,
  }));

  return { rangeDays, totals, series, models, byPlan: planRows };
}
