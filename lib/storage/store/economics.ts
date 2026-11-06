import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  CohortWindow,
  CustomerContributionPage,
  EconomicsRange,
  FreeCohort,
  FreeCohortCounts,
  SimulationModel,
} from "../../economics.ts";

import {
  CUSTOMER_PAGE_SIZE,
  customerContribution,
  normalizeCohortWindow,
  normalizeCustomerPage,
  normalizeEconomicsRange,
  normalizeObservationWindow,
  summarizeFreeCohort,
} from "../../economics.ts";

/**
 * Operator economics reads (FID-2026-1105-007).
 *
 * These queries are bounded and read-only. A top-up is exposed as principal,
 * never added to contribution; a plan invoice is exposed at its paid date and
 * kept separate from settled credit. Missing fees and refunds stay unavailable
 * rather than becoming zero.
 */

type ContributionRow = {
  user_id: string;
  email: string;
  name: string;
  status: string;
  created_at: string;
  credit_charged_micros: number | string;
  credit_cost_micros: number | string;
  subscription_cost_micros: number | string;
  free_cost_micros: number | string;
  total_cost_micros: number | string;
  plan_cash_micros: number | string;
  paid_invoice_count: number | string;
  topup_principal_micros: number | string;
  request_count: number | string;
  free_request_count: number | string;
};

type CohortRow = {
  eligible_signups: number | string;
  with_first_free: number | string;
  converted_after_free: number | string;
  paid_without_free: number | string;
  unknown_history: number | string;
  observed_activity: number | string;
};

type SimulationModelRow = {
  id: string;
  name: string;
  group_slug: string | null;
  token_weight: number | string;
  cost_input_micros: number | string;
  cost_output_micros: number | string;
  sell_input_micros: number | string;
  sell_output_micros: number | string;
  cost_source: "synced" | "manual" | "unknown";
  cost_observed_at: string | null;
};

function number(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function integer(value: number | string | null | undefined) {
  return Math.max(0, Math.trunc(number(value)));
}

function isoBefore(now: Date, days: number) {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

async function countActivityUsers(db: PostgresDatabase, since: string) {
  const row = await db
    .prepare(
      `WITH activity AS (
         SELECT user_id FROM usage_events
          WHERE user_id IS NOT NULL AND created_at >= ?
         UNION
         SELECT s.user_id
           FROM subscription_invoices i
           JOIN subscriptions s ON s.id = i.subscription_id
          WHERE i.status = 'paid' AND i.currency = 'usd'
            AND COALESCE(i.paid_at, i.created_at) >= ?
         UNION
         SELECT user_id FROM topups
          WHERE user_id IS NOT NULL AND status = 'paid' AND created_at >= ?
       )
       SELECT COUNT(*) AS total
         FROM users u
         JOIN activity a ON a.user_id = u.id
        WHERE u.status <> 'deleted'`,
    )
    .get<{ total: number | string }>(since, since, since);

  return integer(row?.total);
}

export async function getCustomerContributionPage(
  db: PostgresDatabase,
  rangeDays: EconomicsRange,
  page: number,
  now: Date = new Date(),
): Promise<CustomerContributionPage> {
  const range = normalizeEconomicsRange(String(rangeDays));
  const currentPage = normalizeCustomerPage(String(page));
  const since = isoBefore(now, range);
  const total = await countActivityUsers(db, since);
  const pageCount = total === 0 ? 0 : Math.ceil(total / CUSTOMER_PAGE_SIZE);
  const boundedPage = pageCount === 0 ? 1 : Math.min(currentPage, pageCount);
  const offset = (boundedPage - 1) * CUSTOMER_PAGE_SIZE;

  const rows = await db
    .prepare(
      `WITH activity AS (
         SELECT user_id FROM usage_events
          WHERE user_id IS NOT NULL AND created_at >= ?
         UNION
         SELECT s.user_id
           FROM subscription_invoices i
           JOIN subscriptions s ON s.id = i.subscription_id
          WHERE i.status = 'paid' AND i.currency = 'usd'
            AND COALESCE(i.paid_at, i.created_at) >= ?
         UNION
         SELECT user_id FROM topups
          WHERE user_id IS NOT NULL AND status = 'paid' AND created_at >= ?
       ),
       page_users AS (
         SELECT u.id, u.email, u.name, u.status, u.created_at
           FROM users u
           JOIN activity a ON a.user_id = u.id
          WHERE u.status <> 'deleted'
          ORDER BY u.created_at::timestamptz DESC, u.id DESC
          LIMIT ? OFFSET ?
       ),
       usage AS (
         SELECT user_id,
                COALESCE(SUM(CASE WHEN status = 'ok'
                                    AND billing_source = 'credit'
                                   THEN charged_micros ELSE 0 END), 0) AS credit_charged_micros,
                COALESCE(SUM(CASE WHEN billing_source = 'credit'
                                   THEN cost_micros ELSE 0 END), 0) AS credit_cost_micros,
                COALESCE(SUM(CASE WHEN billing_source = 'subscription'
                                   THEN cost_micros ELSE 0 END), 0) AS subscription_cost_micros,
                COALESCE(SUM(CASE WHEN billing_source = 'free'
                                   THEN cost_micros ELSE 0 END), 0) AS free_cost_micros,
                COALESCE(SUM(cost_micros), 0) AS total_cost_micros,
                COUNT(*) AS request_count,
                COALESCE(SUM(CASE WHEN billing_source = 'free'
                                   THEN 1 ELSE 0 END), 0) AS free_request_count
           FROM usage_events
          WHERE created_at >= ?
            AND user_id IN (SELECT id FROM page_users)
          GROUP BY user_id
       ),
       invoices AS (
         SELECT s.user_id,
                COALESCE(SUM(i.amount_micros), 0) AS plan_cash_micros,
                COUNT(*) AS paid_invoice_count
           FROM subscription_invoices i
           JOIN subscriptions s ON s.id = i.subscription_id
          WHERE i.status = 'paid' AND i.currency = 'usd'
            AND COALESCE(i.paid_at, i.created_at) >= ?
            AND s.user_id IN (SELECT id FROM page_users)
          GROUP BY s.user_id
       ),
       topups AS (
         SELECT user_id, COALESCE(SUM(amount_micros), 0) AS topup_principal_micros
           FROM topups
          WHERE status = 'paid' AND created_at >= ?
            AND user_id IN (SELECT id FROM page_users)
          GROUP BY user_id
       )
       SELECT p.id AS user_id, p.email, p.name, p.status, p.created_at,
              COALESCE(u.credit_charged_micros, 0) AS credit_charged_micros,
              COALESCE(u.credit_cost_micros, 0) AS credit_cost_micros,
              COALESCE(u.subscription_cost_micros, 0) AS subscription_cost_micros,
              COALESCE(u.free_cost_micros, 0) AS free_cost_micros,
              COALESCE(u.total_cost_micros, 0) AS total_cost_micros,
              COALESCE(i.plan_cash_micros, 0) AS plan_cash_micros,
              COALESCE(i.paid_invoice_count, 0) AS paid_invoice_count,
              COALESCE(t.topup_principal_micros, 0) AS topup_principal_micros,
              COALESCE(u.request_count, 0) AS request_count,
              COALESCE(u.free_request_count, 0) AS free_request_count
         FROM page_users p
         LEFT JOIN usage u ON u.user_id = p.id
         LEFT JOIN invoices i ON i.user_id = p.id
         LEFT JOIN topups t ON t.user_id = p.id
        ORDER BY p.created_at::timestamptz DESC, p.id DESC`,
    )
    .all<ContributionRow>(
      since,
      since,
      since,
      CUSTOMER_PAGE_SIZE,
      offset,
      since,
      since,
      since,
    );

  return {
    rows: rows.map((row) =>
      customerContribution({
        userId: row.user_id,
        email: row.email,
        name: row.name,
        status: row.status,
        createdAt: row.created_at,
        creditChargedMicros: number(row.credit_charged_micros),
        creditCostMicros: number(row.credit_cost_micros),
        subscriptionCostMicros: number(row.subscription_cost_micros),
        freeCostMicros: number(row.free_cost_micros),
        totalCostMicros: number(row.total_cost_micros),
        planCashMicros: number(row.plan_cash_micros),
        paidInvoiceCount: integer(row.paid_invoice_count),
        topupPrincipalMicros: number(row.topup_principal_micros),
        requestCount: integer(row.request_count),
        freeRequestCount: integer(row.free_request_count),
      }),
    ),
    page: boundedPage,
    pageSize: CUSTOMER_PAGE_SIZE,
    total,
    pageCount,
    rangeDays: range,
    since,
  };
}

export async function getFreeCohort(
  db: PostgresDatabase,
  cohortDays: CohortWindow,
  observationDays: CohortWindow,
  now: Date = new Date(),
): Promise<FreeCohort> {
  const cohort = normalizeCohortWindow(String(cohortDays));
  const observation = normalizeObservationWindow(String(observationDays));
  const cohortEndDate = new Date(now.getTime() - observation * 86_400_000);
  const cohortStartDate = new Date(
    cohortEndDate.getTime() - cohort * 86_400_000,
  );
  const cohortStart = cohortStartDate.toISOString();
  const cohortEnd = cohortEndDate.toISOString();

  const row = await db
    .prepare(
      `WITH cohort AS (
         SELECT id, created_at,
                (created_at::timestamptz +
                 (?::text || ' days')::interval) AS observation_end
           FROM users
          WHERE status <> 'deleted'
            AND created_at >= ?
            AND created_at < ?
       ),
       events AS (
         SELECT c.id, c.created_at, c.observation_end,
                (SELECT MIN(u.created_at::timestamptz)
                   FROM usage_events u
                  WHERE u.user_id = c.id
                    AND u.status = 'ok'
                    AND u.billing_source = 'free'
                    AND u.created_at::timestamptz >= c.created_at::timestamptz
                    AND u.created_at::timestamptz < c.observation_end) AS first_free_at,
                (SELECT MIN(x.at)
                   FROM (
                     SELECT created_at::timestamptz AS at
                       FROM usage_events
                      WHERE user_id = c.id
                        AND status = 'ok'
                        AND billing_source IN ('credit', 'subscription')
                     UNION ALL
                     SELECT COALESCE(paid_at, created_at)::timestamptz AS at
                       FROM topups
                      WHERE user_id = c.id AND status = 'paid'
                     UNION ALL
                     SELECT COALESCE(i.paid_at, i.created_at)::timestamptz AS at
                       FROM subscription_invoices i
                       JOIN subscriptions s ON s.id = i.subscription_id
                      WHERE s.user_id = c.id
                        AND i.status = 'paid'
                        AND i.currency = 'usd'
                   ) x
                  WHERE x.at >= c.created_at::timestamptz
                    AND x.at < c.observation_end) AS first_paid_at,
                (SELECT COUNT(*)
                   FROM usage_events u
                  WHERE u.user_id = c.id
                    AND u.created_at::timestamptz >= c.created_at::timestamptz
                    AND u.created_at::timestamptz < c.observation_end) AS usage_count,
                (SELECT COUNT(*)
                   FROM topups t
                  WHERE t.user_id = c.id
                    AND t.created_at::timestamptz >= c.created_at::timestamptz
                    AND t.created_at::timestamptz < c.observation_end) AS topup_count,
                (SELECT COUNT(*)
                   FROM subscriptions s
                  WHERE s.user_id = c.id
                    AND s.created_at::timestamptz >= c.created_at::timestamptz
                    AND s.created_at::timestamptz < c.observation_end) AS subscription_count
           FROM cohort c
       )
       SELECT COUNT(*) AS eligible_signups,
              COUNT(*) FILTER (WHERE first_free_at IS NOT NULL) AS with_first_free,
              COUNT(*) FILTER (
                WHERE first_free_at IS NOT NULL
                  AND first_paid_at IS NOT NULL
                  AND first_paid_at >= first_free_at
              ) AS converted_after_free,
              COUNT(*) FILTER (
                WHERE first_free_at IS NULL AND first_paid_at IS NOT NULL
              ) AS paid_without_free,
              COUNT(*) FILTER (
                WHERE usage_count = 0
                  AND topup_count = 0
                  AND subscription_count = 0
              ) AS unknown_history,
              COUNT(*) FILTER (
                WHERE usage_count > 0
                   OR topup_count > 0
                   OR subscription_count > 0
              ) AS observed_activity
         FROM events`,
    )
    .get<CohortRow>(String(observation), cohortStart, cohortEnd);

  const counts: FreeCohortCounts = {
    eligibleSignups: integer(row?.eligible_signups),
    withFirstFree: integer(row?.with_first_free),
    convertedAfterFree: integer(row?.converted_after_free),
    paidWithoutFree: integer(row?.paid_without_free),
    unknownHistory: integer(row?.unknown_history),
    observedActivity: integer(row?.observed_activity),
  };

  return summarizeFreeCohort({
    cohortDays: cohort,
    observationDays: observation,
    cohortStart,
    cohortEnd,
    counts,
  });
}

export async function listSimulationModels(
  db: PostgresDatabase,
): Promise<SimulationModel[]> {
  const rows = await db
    .prepare(
      `SELECT id, name, group_slug, token_weight,
              input_price_micros AS cost_input_micros,
              output_price_micros AS cost_output_micros,
              sell_input_micros, sell_output_micros,
              cost_source, cost_observed_at
         FROM models
        WHERE in_catalog = 1 AND status = 'active'
        ORDER BY provider ASC, sort_order ASC, name ASC`,
    )
    .all<SimulationModelRow>();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    groupSlug: row.group_slug ?? "",
    tokenWeight: Math.max(1, integer(row.token_weight)),
    costInputMicros: number(row.cost_input_micros),
    costOutputMicros: number(row.cost_output_micros),
    sellInputMicros: number(row.sell_input_micros),
    sellOutputMicros: number(row.sell_output_micros),
    costSource: row.cost_source,
    costObservedAt: row.cost_observed_at,
  }));
}
