import "server-only";

import type { PlanGroupInclusion, PlanStatus, PlanSummary } from "../types";

import { db } from "../db";
import { readPlanSalesPolicy } from "../plan-sales";
import { expandEntitlementIds } from "../plans";

export type PlanRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: PlanStatus;
  price_micros: number;
  currency: string;
  interval: "month" | "year";
  included_weighted_tokens: number;
  overage_mode: "block" | "credit";
  overage_markup_bps: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PlanModelRow = {
  id: string;
  group_slug: string | null;
  cost_input: number;
  cost_output: number;
};

export const PLAN_COLUMNS = `
  id, slug, name, description, status, price_micros, currency, interval,
  included_weighted_tokens, overage_mode, overage_markup_bps, sort_order,
  created_at, updated_at
`;

export function allPlanRows() {
  return db
    .prepare(`SELECT ${PLAN_COLUMNS} FROM plans ORDER BY sort_order, name`)
    .all() as PlanRow[];
}

export function allPlanModels() {
  return db
    .prepare(
      `SELECT id, group_slug, input_price_micros AS cost_input,
         output_price_micros AS cost_output
       FROM models`,
    )
    .all() as PlanModelRow[];
}

function groupsFor(planId: string): PlanGroupInclusion[] {
  return db
    .prepare(
      `SELECT g.slug, g.label
       FROM plan_groups pg
       JOIN model_groups g ON g.slug = pg.group_slug
       WHERE pg.plan_id = ?
       ORDER BY g.sort_order, g.label`,
    )
    .all(planId) as PlanGroupInclusion[];
}

function explicitModelsFor(planId: string) {
  return (
    db
      .prepare(
        `SELECT model_id FROM plan_models WHERE plan_id = ? ORDER BY model_id`,
      )
      .all(planId) as Array<{ model_id: string }>
  ).map((row) => row.model_id);
}

function subscriptionCounts(planId: string) {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status IN ('active', 'past_due') THEN 1 ELSE 0 END) AS active
       FROM subscriptions WHERE plan_id = ?`,
    )
    .get(planId) as { total: number; active: number | null };

  return { subscriberCount: row.total, activeSubscriberCount: row.active ?? 0 };
}

export function toPlanSummary(
  row: PlanRow,
  models: PlanModelRow[],
  groups: PlanGroupInclusion[],
  explicitIds: string[],
): PlanSummary {
  const modelIds = expandEntitlementIds({
    groups: groups.map((group) => group.slug),
    modelIds: explicitIds,
    models: models.map((model) => ({
      id: model.id,
      groupSlug: model.group_slug ?? "",
    })),
  });
  const costBearing = models.filter(
    (model) =>
      modelIds.includes(model.id) &&
      (model.cost_input > 0 || model.cost_output > 0),
  );
  const counts = subscriptionCounts(row.id);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.status,
    priceMicros: row.price_micros,
    currency: row.currency,
    interval: row.interval,
    includedWeightedTokens: row.included_weighted_tokens,
    overageMode: row.overage_mode,
    overageMarkupBps: row.overage_markup_bps,
    sortOrder: row.sort_order,
    groups,
    modelIds,
    modelCount: modelIds.length,
    costBearingModelCount: costBearing.length,
    subscriberCount: counts.subscriberCount,
    activeSubscriberCount: counts.activeSubscriberCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function summarizePlanRows(
  rows = allPlanRows(),
  models = allPlanModels(),
) {
  return rows.map((row) =>
    toPlanSummary(row, models, groupsFor(row.id), explicitModelsFor(row.id)),
  );
}

export function listPlans() {
  return summarizePlanRows();
}

export function listActivePlans() {
  return summarizePlanRows(
    allPlanRows().filter((row) => row.status === "active"),
  ).filter((plan) => plan.modelCount > 0);
}

/** Public, purchasable plans. Empty while the launch sales policy is off, so
 * no surface publishes a plan that checkout will refuse. */
export function listSellablePlans() {
  return readPlanSalesPolicy().selling ? listActivePlans() : [];
}

export function listPlansByStatus(status: PlanStatus) {
  return listPlans().filter((plan) => plan.status === status);
}

export function getPlanById(id: string) {
  return listPlans().find((plan) => plan.id === id) ?? null;
}

export function getPlanBySlug(slug: string) {
  return listPlans().find((plan) => plan.slug === slug) ?? null;
}

export function planEntitlementIds(planId: string) {
  return getPlanById(planId)?.modelIds ?? [];
}
