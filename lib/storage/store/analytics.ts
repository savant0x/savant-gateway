import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  AnalyticsData,
  AnalyticsModel,
  AnalyticsPlan,
  AnalyticsPoint,
  AnalyticsTotals,
  PlanInterval,
} from "../../types.ts";

import {
  ANALYTICS_RANGES,
  normalizeAnalyticsRange,
  type AnalyticsRange,
} from "../../analytics.ts";
import { monthlyRecurringMicros } from "../../revenue.ts";

export { ANALYTICS_RANGES, normalizeAnalyticsRange };
export type { AnalyticsRange };

/**
 * Analytics read model, ported to the async handle (FID-086, Batch B).
 *
 * The shape of the report is unchanged, including its two deliberate honesty
 * rules: a day with no traffic is a zero point rather than a missing one, and a
 * plan with no paid invoice still appears if it has a subscriber, so revenue and
 * subscriber counts cannot silently disagree.
 *
 * Three translations were required:
 *
 * 1. `strftime('%Y-%m-%d', x)` becomes `to_char(x::timestamptz, 'YYYY-MM-DD')`.
 *    Timestamps are ISO-8601 text (D-13), so the cast is what gives them time
 *    semantics rather than lexical order.
 * 2. `datetime(x)` becomes `x::timestamptz`, in the one ordering that used it.
 * 3. Every aggregate is coerced at this boundary. `SUM`/`AVG`/`COUNT` arrive as
 *    strings from the driver to protect `BIGINT` precision, and the report's
 *    arithmetic is JavaScript numbers.
 */

type TotalsRow = {
  requests: number | string;
  ok_requests: number | string;
  input_tokens: number | string;
  output_tokens: number | string;
  charged_micros: number | string;
  cost_micros: number | string;
  average_latency_ms: number | string;
  max_latency_ms: number | string;
};

type PointRow = {
  day: string;
  requests: number | string;
  tokens: number | string;
  charged_micros: number | string;
  cost_micros: number | string;
};

type ModelRow = {
  model_id: string | null;
  model_name: string | null;
  family: string | null;
  requests: number | string;
  tokens: number | string;
  charged_micros: number | string;
  cost_micros: number | string;
};

type InvoicePointRow = {
  day: string;
  plan_revenue_micros: number | string;
};

type InvoicePlanRow = {
  plan_id: string;
  plan_name: string | null;
  interval: PlanInterval;
  paid_invoice_count: number | string;
  plan_revenue_micros: number | string;
};

type SubscriptionRow = {
  plan_id: string;
  plan_name: string | null;
  interval: PlanInterval;
  status: "active" | "past_due";
  source: "stripe" | "manual";
  price_micros: number | string;
  cancel_at_period_end: number | string;
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

async function readPlanRows(db: PostgresDatabase, since: string) {
  const rows = new Map<string, AnalyticsPlan>();

  const invoiceRows = await db
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
          AND COALESCE(i.paid_at, i.created_at) >= ?
        GROUP BY s.plan_id, s.interval_snapshot
        ORDER BY plan_revenue_micros DESC, plan_name ASC`,
    )
    .all<InvoicePlanRow>(since);

  for (const row of invoiceRows) {
    rows.set(planKey(row.plan_id, row.interval), {
      planId: row.plan_id,
      planName: planName(row),
      interval: row.interval,
      activeSubscribers: 0,
      pastDueSubscribers: 0,
      mrrMicros: 0,
      paidInvoiceCount: Number(row.paid_invoice_count),
      planRevenueMicros: Number(row.plan_revenue_micros),
    });
  }

  const subscriptions = await db
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
        ORDER BY s.created_at::timestamptz ASC`,
    )
    .all<SubscriptionRow>();

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

      if (Number(row.cancel_at_period_end) === 1) {
        cancelingSubscribers += 1;
      }

      if (row.source === "manual") {
        manualSubscribers += 1;
      } else if (Number(row.cancel_at_period_end) === 0) {
        const monthly = monthlyRecurringMicros(
          Number(row.price_micros),
          row.interval,
        );

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

export async function getAnalyticsData(
  db: PostgresDatabase,
  rangeDays: AnalyticsRange,
  now: Date = new Date(),
): Promise<AnalyticsData> {
  const since = cutoffIso(now, rangeDays);

  const totalsRow = await db
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
       WHERE created_at >= ?`,
    )
    .get<TotalsRow>(since);

  const pointRows = await db
    .prepare(
      `SELECT to_char(created_at::timestamptz, 'YYYY-MM-DD') AS day,
              COUNT(*) AS requests,
              COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
              COALESCE(SUM(charged_micros), 0) AS charged_micros,
              COALESCE(SUM(cost_micros), 0) AS cost_micros
         FROM usage_events
        WHERE created_at >= ?
        GROUP BY day
        ORDER BY day ASC`,
    )
    .all<PointRow>(since);

  const modelRows = await db
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
        WHERE u.created_at >= ?
        GROUP BY u.model_id, m.name, m.provider
        ORDER BY charged_micros DESC, requests DESC
        LIMIT 12`,
    )
    .all<ModelRow>(since);

  const invoicePointRows = await db
    .prepare(
      `SELECT to_char(COALESCE(paid_at, created_at)::timestamptz, 'YYYY-MM-DD') AS day,
              COALESCE(SUM(amount_micros), 0) AS plan_revenue_micros
         FROM subscription_invoices
        WHERE status = 'paid' AND currency = 'usd'
          AND COALESCE(paid_at, created_at) >= ?
        GROUP BY day
        ORDER BY day ASC`,
    )
    .all<InvoicePointRow>(since);

  const byDay = new Map(pointRows.map((row) => [row.day, row]));
  const invoiceByDay = new Map(
    invoicePointRows.map((row) => [row.day, Number(row.plan_revenue_micros)]),
  );

  const series: AnalyticsPoint[] = dayKeys(rangeDays, now).map((date) => {
    const row = byDay.get(date);

    return {
      date,
      requests: Number(row?.requests ?? 0),
      tokens: Number(row?.tokens ?? 0),
      chargedMicros: Number(row?.charged_micros ?? 0),
      planRevenueMicros: invoiceByDay.get(date) ?? 0,
      costMicros: Number(row?.cost_micros ?? 0),
    };
  });

  const planSummary = await readPlanRows(db, since);
  const planRows = Array.from(planSummary.plans.values()).sort(
    (left, right) =>
      right.planRevenueMicros - left.planRevenueMicros ||
      right.mrrMicros - left.mrrMicros ||
      left.planName.localeCompare(right.planName),
  );

  const requests = Number(totalsRow?.requests ?? 0);
  const okRequests = Number(totalsRow?.ok_requests ?? 0);
  const chargedMicros = Number(totalsRow?.charged_micros ?? 0);
  const costMicros = Number(totalsRow?.cost_micros ?? 0);
  const errorRequests = Math.max(0, requests - okRequests);
  const planRevenueMicros = planRows.reduce(
    (total, plan) => total + plan.planRevenueMicros,
    0,
  );
  const paidInvoiceCount = planRows.reduce(
    (total, plan) => total + plan.paidInvoiceCount,
    0,
  );
  const totalRevenueMicros = chargedMicros + planRevenueMicros;

  const totals: AnalyticsTotals = {
    requests,
    okRequests,
    errorRequests,
    inputTokens: Number(totalsRow?.input_tokens ?? 0),
    outputTokens: Number(totalsRow?.output_tokens ?? 0),
    chargedMicros,
    planRevenueMicros,
    totalRevenueMicros,
    paidInvoiceCount,
    costMicros,
    marginMicros: chargedMicros - costMicros,
    totalMarginMicros: totalRevenueMicros - costMicros,
    activeSubscribers: planSummary.activeSubscribers,
    pastDueSubscribers: planSummary.pastDueSubscribers,
    cancelingSubscribers: planSummary.cancelingSubscribers,
    manualSubscribers: planSummary.manualSubscribers,
    mrrMicros: planSummary.mrrMicros,
    averageLatencyMs: Math.round(Number(totalsRow?.average_latency_ms ?? 0)),
    maxLatencyMs: Number(totalsRow?.max_latency_ms ?? 0),
    errorRateBps:
      requests === 0 ? 0 : Math.round((errorRequests / requests) * 10_000),
  };

  const models: AnalyticsModel[] = modelRows.map((row) => ({
    modelId: row.model_id ?? "unknown",
    modelName: row.model_name ?? row.model_id ?? "Unknown model",
    family: row.family ?? "—",
    requests: Number(row.requests),
    tokens: Number(row.tokens),
    chargedMicros: Number(row.charged_micros),
    costMicros: Number(row.cost_micros),
  }));

  return { rangeDays, totals, series, models, byPlan: planRows };
}
