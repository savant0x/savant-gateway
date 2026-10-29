import "server-only";

import type { PlanSummary } from "../types";

import { randomUUID } from "node:crypto";

import { db, nowIso } from "../db";
import {
  expandEntitlementIds,
  type PlanValues,
  readPlanValues,
} from "../plans";

import { allPlanModels, getPlanById, summarizePlanRows } from "./plan-rows";

type GroupRow = {
  slug: string;
  label: string;
  billing_mode: string;
};

export {
  getPlanById,
  getPlanBySlug,
  listActivePlans,
  listPlans,
} from "./plan-rows";

export type PlanMutation =
  | { ok: true; plan: PlanSummary }
  | { ok: false; status: 400 | 404 | 409; error: string };

function readGroups(slugs: string[]) {
  if (slugs.length === 0)
    return { ok: true as const, groups: [] as GroupRow[] };

  const rows = db
    .prepare(
      `SELECT slug, label, billing_mode FROM model_groups
       WHERE slug IN (${slugs.map(() => "?").join(", ")})`,
    )
    .all(...slugs) as GroupRow[];

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

function validateInclusions(values: PlanValues) {
  const groups = readGroups(values.groups);

  if (!groups.ok) return groups;

  const ids = Array.from(new Set(values.modelIds));
  const allModels = allPlanModels();
  const selected = allModels.filter((model) => ids.includes(model.id));

  if (selected.length !== ids.length) {
    return {
      ok: false as const,
      error: "One or more included models do not exist.",
    };
  }

  const freeSlugs = new Set(
    db
      .prepare("SELECT slug FROM model_groups WHERE billing_mode = 'free'")
      .all()
      .map((row) => (row as { slug: string }).slug),
  );

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

function nameExists(name: string, exceptId = "") {
  return Boolean(
    db
      .prepare("SELECT id FROM plans WHERE name = ? AND id <> ?")
      .get(name, exceptId),
  );
}

function slugExists(slug: string) {
  return Boolean(db.prepare("SELECT id FROM plans WHERE slug = ?").get(slug));
}

function insertInclusions(planId: string, values: PlanValues) {
  const groupInsert = db.prepare(
    "INSERT INTO plan_groups (plan_id, group_slug) VALUES (?, ?)",
  );
  const modelInsert = db.prepare(
    "INSERT INTO plan_models (plan_id, model_id) VALUES (?, ?)",
  );

  for (const slug of values.groups) groupInsert.run(planId, slug);
  for (const modelId of values.modelIds) modelInsert.run(planId, modelId);
}

export function createPlan(input: unknown): PlanMutation {
  const parsed = readPlanValues(input);

  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };

  const values = parsed.value;

  if (slugExists(values.slug)) {
    return {
      ok: false,
      status: 409,
      error: "That plan slug is already in use.",
    };
  }

  if (nameExists(values.name)) {
    return {
      ok: false,
      status: 409,
      error: "That plan name is already in use.",
    };
  }

  const inclusions = validateInclusions(values);

  if (!inclusions.ok) {
    return { ok: false, status: 400, error: inclusions.error };
  }

  const id = `plan_${randomUUID()}`;
  const now = nowIso();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO plans
        (id, slug, name, description, status, price_micros, currency, interval,
         included_weighted_tokens, overage_mode, overage_markup_bps, sort_order,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
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

    insertInclusions(id, values);
  }).immediate();

  return { ok: true, plan: getPlanById(id)! };
}

export function updatePlan(id: string, input: unknown): PlanMutation {
  const current = db.prepare("SELECT slug FROM plans WHERE id = ?").get(id) as
    { slug: string } | undefined;

  if (!current) return { ok: false, status: 404, error: "Plan not found." };

  const base =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const parsed = readPlanValues({ ...base, slug: current.slug });

  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };

  const values = parsed.value;

  if (nameExists(values.name, id)) {
    return {
      ok: false,
      status: 409,
      error: "That plan name is already in use.",
    };
  }

  const inclusions = validateInclusions(values);

  if (!inclusions.ok) {
    return { ok: false, status: 400, error: inclusions.error };
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE plans
       SET name = ?, description = ?, status = ?, price_micros = ?,
           currency = ?, interval = ?, included_weighted_tokens = ?,
           overage_mode = ?, overage_markup_bps = ?, sort_order = ?,
           updated_at = ?
       WHERE id = ?`,
    ).run(
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
      nowIso(),
      id,
    );

    db.prepare("DELETE FROM plan_groups WHERE plan_id = ?").run(id);
    db.prepare("DELETE FROM plan_models WHERE plan_id = ?").run(id);
    insertInclusions(id, values);
  }).immediate();

  return { ok: true, plan: getPlanById(id)! };
}

export function planHasSubscriptions(planId: string) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM subscriptions WHERE plan_id = ? LIMIT 1")
      .get(planId),
  );
}

export function deletePlan(
  id: string,
): { ok: true } | { ok: false; status: 404 | 409; error: string } {
  const plan = getPlanById(id);

  if (!plan) return { ok: false, status: 404, error: "Plan not found." };

  if (plan.status === "active") {
    return {
      ok: false,
      status: 409,
      error: "Archive the plan before deleting it.",
    };
  }

  if (planHasSubscriptions(id)) {
    return {
      ok: false,
      status: 409,
      error: "This plan has subscriptions. Archive it instead.",
    };
  }

  db.prepare("DELETE FROM plans WHERE id = ?").run(id);

  return { ok: true };
}

export { summarizePlanRows, allPlanModels };
