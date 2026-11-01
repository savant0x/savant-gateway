import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  PlanGroupInclusion,
  PlanStatus,
  PlanSummary,
} from "../../types.ts";

import { readPlanSalesPolicy } from "../../plan-sales.ts";
import { expandEntitlementIds } from "../../plans.ts";

/**
 * Plan read model, ported to the async handle (FID-085 step 4).
 *
 * `toPlanSummary` stays a pure function of its inputs. The live version reads
 * subscriber counts from inside it, which is fine when the database handle is a
 * module singleton and impossible when it is an argument and every read is a
 * promise. Counts are therefore passed in, which also makes the shape of a plan
 * summary testable without a database.
 *
 * `BIGINT` money arrives as a string, so every numeric field is coerced here
 * rather than inside the mapper.
 */

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

export type SubscriberCounts = {
  subscriberCount: number;
  activeSubscriberCount: number;
};

export const PLAN_COLUMNS = `
  id, slug, name, description, status, price_micros, currency, interval,
  included_weighted_tokens, overage_mode, overage_markup_bps, sort_order,
  created_at, updated_at
`;

export async function allPlanRows(db: PostgresDatabase) {
  return db
    .prepare(`SELECT ${PLAN_COLUMNS} FROM plans ORDER BY sort_order, name`)
    .all<PlanRow>();
}

export async function allPlanModels(db: PostgresDatabase) {
  const rows = await db
    .prepare(
      `SELECT id, group_slug, input_price_micros AS cost_input,
              output_price_micros AS cost_output
         FROM models`,
    )
    .all<PlanModelRow>();

  return rows.map((row) => ({
    id: row.id,
    group_slug: row.group_slug,
    cost_input: Number(row.cost_input),
    cost_output: Number(row.cost_output),
  }));
}

async function groupsFor(db: PostgresDatabase, planId: string) {
  return db
    .prepare(
      `SELECT g.slug, g.label
         FROM plan_groups pg
         JOIN model_groups g ON g.slug = pg.group_slug
        WHERE pg.plan_id = ?
        ORDER BY g.sort_order, g.label`,
    )
    .all<PlanGroupInclusion>(planId);
}

async function explicitModelsFor(db: PostgresDatabase, planId: string) {
  const rows = await db
    .prepare(
      "SELECT model_id FROM plan_models WHERE plan_id = ? ORDER BY model_id",
    )
    .all<{ model_id: string }>(planId);

  return rows.map((row) => row.model_id);
}

export async function subscriptionCounts(
  db: PostgresDatabase,
  planId: string,
): Promise<SubscriberCounts> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status IN ('active', 'past_due') THEN 1 ELSE 0 END) AS active
       FROM subscriptions WHERE plan_id = ?`,
    )
    .get<{ total: number; active: number | null }>(planId);

  return {
    subscriberCount: Number(row?.total ?? 0),
    activeSubscriberCount: Number(row?.active ?? 0),
  };
}

export function toPlanSummary(
  row: PlanRow,
  models: PlanModelRow[],
  groups: PlanGroupInclusion[],
  explicitIds: string[],
  counts: SubscriberCounts,
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

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.status,
    priceMicros: Number(row.price_micros),
    currency: row.currency,
    interval: row.interval,
    includedWeightedTokens: Number(row.included_weighted_tokens),
    overageMode: row.overage_mode,
    overageMarkupBps: Number(row.overage_markup_bps),
    sortOrder: Number(row.sort_order),
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

export async function summarizePlanRows(
  db: PostgresDatabase,
  rows?: PlanRow[],
  models?: PlanModelRow[],
) {
  const planRows = rows ?? (await allPlanRows(db));
  const planModels = models ?? (await allPlanModels(db));

  return Promise.all(
    planRows.map(async (row) =>
      toPlanSummary(
        row,
        planModels,
        await groupsFor(db, row.id),
        await explicitModelsFor(db, row.id),
        await subscriptionCounts(db, row.id),
      ),
    ),
  );
}

export async function listPlans(db: PostgresDatabase) {
  return summarizePlanRows(db);
}

export async function listActivePlans(db: PostgresDatabase) {
  const rows = (await allPlanRows(db)).filter((row) => row.status === "active");
  const plans = await summarizePlanRows(db, rows);

  return plans.filter((plan) => plan.modelCount > 0);
}

/**
 * Public, purchasable plans. Empty while the launch sales policy is off, so no
 * surface publishes a plan that checkout will refuse.
 */
export async function listSellablePlans(db: PostgresDatabase) {
  return readPlanSalesPolicy().selling ? listActivePlans(db) : [];
}

export async function listPlansByStatus(
  db: PostgresDatabase,
  status: PlanStatus,
) {
  return (await listPlans(db)).filter((plan) => plan.status === status);
}

export async function getPlanById(db: PostgresDatabase, id: string) {
  return (await listPlans(db)).find((plan) => plan.id === id) ?? null;
}

export async function getPlanBySlug(db: PostgresDatabase, slug: string) {
  return (await listPlans(db)).find((plan) => plan.slug === slug) ?? null;
}

export async function planEntitlementIds(db: PostgresDatabase, planId: string) {
  return (await getPlanById(db, planId))?.modelIds ?? [];
}
