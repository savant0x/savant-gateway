import type { PostgresDatabase } from "../pg-adapter.ts";
import type { PlanStatus, PlanSummary } from "../../types.ts";

import { randomUUID } from "node:crypto";

import { decidePlanActivation, readPlanSalesPolicy } from "../../plan-sales.ts";
import {
  expandEntitlementIds,
  type PlanValues,
  readPlanValues,
} from "../../plans.ts";

import { allPlanModels, getPlanById } from "./plan-rows.ts";

/**
 * Plan mutation store, ported to the async handle (FID-085 step 4).
 *
 * A plan is a purchasable product, so the rules are the product's boundaries:
 * a free group cannot be included, an active plan needs at least one model that
 * it actually covers, and a plan with subscriptions is archived rather than
 * deleted. `decidePlanActivation` is reused as-is — the sales policy is a policy
 * question, not a storage question, and it should not gain a second copy here.
 *
 * Editing a plan changes future checkouts only. Subscriptions keep their
 * snapshot columns, which is why this module never touches them.
 */

type GroupRow = {
  slug: string;
  label: string;
  billing_mode: string;
};

export {
  allPlanModels,
  getPlanById,
  getPlanBySlug,
  listActivePlans,
  listPlans,
  listPlansByStatus,
  listSellablePlans,
  planEntitlementIds,
  summarizePlanRows,
} from "./plan-rows.ts";

export type PlanMutation =
  | { ok: true; plan: PlanSummary }
  | { ok: false; status: 400 | 404 | 409; error: string };

async function readGroups(db: PostgresDatabase, slugs: string[]) {
  if (slugs.length === 0)
    return { ok: true as const, groups: [] as GroupRow[] };

  const rows = await db
    .prepare(
      `SELECT slug, label, billing_mode FROM model_groups
        WHERE slug IN (${slugs.map(() => "?").join(", ")})`,
    )
    .all<GroupRow>(...slugs);

  if (rows.length !== slugs.length) {
    return {
      ok: false as const,
      error: "One or more included groups do not exist.",
    };
  }

  if (rows.some((group) => group.billing_mode === "free")) {
    return {
      ok: false as const,
      error: "Free groups cannot be included in a paid plan.",
    };
  }

  return { ok: true as const, groups: rows };
}

async function validateInclusions(db: PostgresDatabase, values: PlanValues) {
  const groups = await readGroups(db, values.groups);

  if (!groups.ok) return groups;

  const ids = Array.from(new Set(values.modelIds));
  const allModels = await allPlanModels(db);
  const selected = allModels.filter((model) => ids.includes(model.id));

  if (selected.length !== ids.length) {
    return {
      ok: false as const,
      error: "One or more included models do not exist.",
    };
  }

  const freeGroups = await db
    .prepare("SELECT slug FROM model_groups WHERE billing_mode = 'free'")
    .all<{ slug: string }>();
  const freeSlugs = new Set(freeGroups.map((row) => row.slug));

  if (selected.some((model) => freeSlugs.has(model.group_slug ?? ""))) {
    return {
      ok: false as const,
      error: "Free models cannot be included in a paid plan.",
    };
  }

  const expanded = expandEntitlementIds({
    groups: values.groups,
    modelIds: ids,
    models: allModels.map((model) => ({
      id: model.id,
      groupSlug: model.group_slug ?? "",
    })),
  });

  if (values.status === "active" && expanded.length === 0) {
    return {
      ok: false as const,
      error: "An active plan needs at least one included model.",
    };
  }

  return { ok: true as const };
}

async function nameExists(db: PostgresDatabase, name: string, exceptId = "") {
  return Boolean(
    await db
      .prepare("SELECT id FROM plans WHERE name = ? AND id <> ?")
      .get(name, exceptId),
  );
}

async function slugExists(db: PostgresDatabase, slug: string) {
  return Boolean(
    await db.prepare("SELECT id FROM plans WHERE slug = ?").get(slug),
  );
}

async function insertInclusions(
  db: PostgresDatabase,
  planId: string,
  values: PlanValues,
) {
  for (const slug of values.groups) {
    await db
      .prepare("INSERT INTO plan_groups (plan_id, group_slug) VALUES (?, ?)")
      .run(planId, slug);
  }

  for (const modelId of values.modelIds) {
    await db
      .prepare("INSERT INTO plan_models (plan_id, model_id) VALUES (?, ?)")
      .run(planId, modelId);
  }
}

export async function createPlan(
  db: PostgresDatabase,
  input: unknown,
  now = new Date().toISOString(),
): Promise<PlanMutation> {
  const parsed = readPlanValues(input);

  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };

  const values = parsed.value;

  if (await slugExists(db, values.slug)) {
    return {
      ok: false,
      status: 409,
      error: "That plan slug is already in use.",
    };
  }

  if (await nameExists(db, values.name)) {
    return {
      ok: false,
      status: 409,
      error: "That plan name is already in use.",
    };
  }

  const inclusions = await validateInclusions(db, values);

  if (!inclusions.ok) {
    return { ok: false, status: 400, error: inclusions.error };
  }

  const activation = decidePlanActivation({
    selling: readPlanSalesPolicy().selling,
    current: null,
    next: values.status,
  });

  if (!activation.allowed) {
    return { ok: false, status: 409, error: activation.error };
  }

  const id = `plan_${randomUUID()}`;

  await db
    .transaction(async () => {
      await db
        .prepare(
          `INSERT INTO plans
            (id, slug, name, description, status, price_micros, currency,
             interval, included_weighted_tokens, overage_mode,
             overage_markup_bps, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          values.slug,
          values.name,
          values.description,
          values.status,
          values.priceMicros,
          values.currency,
          values.interval,
          values.includedWeightedTokens,
          values.overageMode,
          values.overageMarkupBps,
          values.sortOrder,
          now,
          now,
        );

      await insertInclusions(db, id, values);
    })
    .immediate();

  return { ok: true, plan: (await getPlanById(db, id))! };
}

export async function updatePlan(
  db: PostgresDatabase,
  id: string,
  input: unknown,
  now = new Date().toISOString(),
): Promise<PlanMutation> {
  const current = await db
    .prepare("SELECT slug, status FROM plans WHERE id = ?")
    .get<{ slug: string; status: PlanStatus }>(id);

  if (!current) return { ok: false, status: 404, error: "Plan not found." };

  const base =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const parsed = readPlanValues({ ...base, slug: current.slug });

  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };

  const values = parsed.value;

  if (await nameExists(db, values.name, id)) {
    return {
      ok: false,
      status: 409,
      error: "That plan name is already in use.",
    };
  }

  const inclusions = await validateInclusions(db, values);

  if (!inclusions.ok) {
    return { ok: false, status: 400, error: inclusions.error };
  }

  const activation = decidePlanActivation({
    selling: readPlanSalesPolicy().selling,
    current: current.status,
    next: values.status,
  });

  if (!activation.allowed) {
    return { ok: false, status: 409, error: activation.error };
  }

  await db
    .transaction(async () => {
      await db
        .prepare(
          `UPDATE plans
              SET name = ?, description = ?, status = ?, price_micros = ?,
                  currency = ?, interval = ?, included_weighted_tokens = ?,
                  overage_mode = ?, overage_markup_bps = ?, sort_order = ?,
                  updated_at = ?
            WHERE id = ?`,
        )
        .run(
          values.name,
          values.description,
          values.status,
          values.priceMicros,
          values.currency,
          values.interval,
          values.includedWeightedTokens,
          values.overageMode,
          values.overageMarkupBps,
          values.sortOrder,
          now,
          id,
        );

      await db.prepare("DELETE FROM plan_groups WHERE plan_id = ?").run(id);
      await db.prepare("DELETE FROM plan_models WHERE plan_id = ?").run(id);
      await insertInclusions(db, id, values);
    })
    .immediate();

  return { ok: true, plan: (await getPlanById(db, id))! };
}

export async function planHasSubscriptions(
  db: PostgresDatabase,
  planId: string,
) {
  return Boolean(
    await db
      .prepare("SELECT 1 FROM subscriptions WHERE plan_id = ? LIMIT 1")
      .get(planId),
  );
}

export async function deletePlan(
  db: PostgresDatabase,
  id: string,
): Promise<{ ok: true } | { ok: false; status: 404 | 409; error: string }> {
  const plan = await getPlanById(db, id);

  if (!plan) return { ok: false, status: 404, error: "Plan not found." };

  if (plan.status === "active") {
    return {
      ok: false,
      status: 409,
      error: "Archive the plan before deleting it.",
    };
  }

  if (await planHasSubscriptions(db, id)) {
    return {
      ok: false,
      status: 409,
      error: "This plan has subscriptions. Archive it instead.",
    };
  }

  await db.prepare("DELETE FROM plans WHERE id = ?").run(id);

  return { ok: true };
}
