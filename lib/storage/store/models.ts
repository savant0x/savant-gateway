import type { PostgresDatabase } from "../pg-adapter.ts";
import type { AdminModelSummary } from "../../types.ts";
import type { EligibilityDecision } from "../../providers/eligibility.ts";

import { isModelEligible } from "../../providers/eligibility.ts";
import { routeGroupKey } from "../../model-identity.ts";
import { pricesForGroup } from "../../model-groups.ts";
import { defaultSellMicros } from "../../pricing.ts";
import {
  accessFor,
  type GatewayModel,
  type ModelRow,
  toAdminModelSummary,
  toGatewayModel,
} from "../../projections.ts";

import { MODEL_SELECT } from "./model-sql.ts";
import { recordPricingDecision } from "./pricing-decisions.ts";
import { reconcileRoutes, routesByGroup } from "./routes.ts";
import { getMarkupBps } from "./settings.ts";

/**
 * Admin model store, ported to the async handle (FID-085 step 4).
 *
 * This module owns reads and single-row pricing edits. The full-catalog upsert
 * lives in `./model-sync.ts`: it is the one operation that rewrites the catalog
 * wholesale, and keeping it beside these reads hid how much destructive power
 * sat next to them.
 *
 * The projection and access rules are the live ones (`accessFor`,
 * `toAdminModelSummary` from `lib/projections.ts`), so the ported admin catalog
 * cannot disagree with the live one about which group bills a model.
 */

/** The columns `accessFor` needs, named once instead of inline three times. */
type AccessRow = Pick<
  ModelRow,
  | "allow_free"
  | "token_weight"
  | "upstream_id"
  | "group_slug"
  | "group_billing_mode"
>;

type StatusRow = AccessRow &
  Pick<
    ModelRow,
    | "cost_source"
    | "input_price_micros"
    | "output_price_micros"
    | "sell_input_micros"
    | "sell_output_micros"
  > & {
    requires_model_review: number;
    eligibility_decision: EligibilityDecision | null;
  };

export async function listAllModels(
  db: PostgresDatabase,
): Promise<AdminModelSummary[]> {
  const rows = await db
    .prepare(
      `${MODEL_SELECT}
       ORDER BY m.in_catalog DESC,
                CASE WHEN m.status = 'active' THEN 0 ELSE 1 END,
                CASE WHEN g.billing_mode = 'free' THEN 0 ELSE 1 END,
                COALESCE(g.sort_order, 9999) ASC, m.provider ASC,
                m.sort_order ASC, m.name ASC`,
    )
    .all<ModelRow>();
  const routes = routesByGroup(rows);

  return rows.map((row) =>
    toAdminModelSummary(
      row,
      routes.get(
        routeGroupKey({
          routeGroup: row.route_group,
          upstreamId: row.upstream_id,
          billingMode: row.group_billing_mode ?? "paid",
        }),
      ) ?? [],
    ),
  );
}

export type ModelStatusResult =
  "ok" | "not_found" | "cost_unknown" | "not_eligible";

export async function setModelStatus(
  db: PostgresDatabase,
  modelId: string,
  status: "active" | "disabled",
): Promise<ModelStatusResult> {
  if (status === "active") {
    const row = await db
      .prepare(
        `SELECT m.allow_free, m.token_weight, m.upstream_id, m.group_slug,
                m.cost_source, m.input_price_micros, m.output_price_micros,
                m.sell_input_micros, m.sell_output_micros,
                p.requires_model_review, me.decision AS eligibility_decision,
                g.billing_mode AS group_billing_mode
           FROM models m
           JOIN providers p ON p.slug = m.upstream_slug
           LEFT JOIN model_eligibility me
             ON me.provider_slug = m.upstream_slug
            AND me.upstream_id = m.upstream_id
           LEFT JOIN model_groups g ON g.slug = m.group_slug
          WHERE m.id = ?`,
      )
      .get<StatusRow>(modelId);

    if (!row) return "not_found";

    if (Number(row.requires_model_review) === 1) {
      if (
        !isModelEligible({
          requiresReview: true,
          decision: row.eligibility_decision,
        })
      ) {
        return "not_eligible";
      }

      if (
        accessFor(row) !== "free" &&
        (Number(row.input_price_micros) <= 0 ||
          Number(row.output_price_micros) <= 0 ||
          Number(row.sell_input_micros) <= 0 ||
          Number(row.sell_output_micros) <= 0)
      ) {
        return "cost_unknown";
      }
    } else if (accessFor(row) !== "free" && row.cost_source === "unknown") {
      return "cost_unknown";
    }
  }

  const result = await db
    .prepare("UPDATE models SET status = ? WHERE id = ?")
    .run(status, modelId);

  if (result.changes > 0) await reconcileRoutes(db);

  return result.changes > 0 ? "ok" : "not_found";
}

export async function setModelCost(
  db: PostgresDatabase,
  modelId: string,
  costInputMicros: number,
  costOutputMicros: number,
) {
  const row = await db
    .prepare(
      `${MODEL_SELECT}
       WHERE m.id = ?`,
    )
    .get<ModelRow>(modelId);

  if (!row) return false;

  const input = Math.max(0, Math.round(costInputMicros));
  const output = Math.max(0, Math.round(costOutputMicros));
  const markupBps = await getMarkupBps(db);
  const sell =
    row.price_source === "manual"
      ? {
          sellInputMicros: Number(row.sell_input_micros),
          sellOutputMicros: Number(row.sell_output_micros),
        }
      : {
          sellInputMicros: defaultSellMicros(input, markupBps),
          sellOutputMicros: defaultSellMicros(output, markupBps),
        };
  const priced = pricesForGroup({
    billingMode: accessFor(row),
    ...sell,
  });

  await db
    .prepare(
      `UPDATE models
          SET input_price_micros = ?, output_price_micros = ?,
              cost_source = 'manual', sell_input_micros = ?,
              sell_output_micros = ?, cost_observed_at = ?
        WHERE id = ?`,
    )
    .run(
      input,
      output,
      priced.sellInputMicros,
      priced.sellOutputMicros,
      new Date().toISOString(),
      modelId,
    );

  await reconcileRoutes(db);

  return true;
}

/**
 * The audit metadata for an approved price (FID-2026-1103-141). The price
 * update and this row commit together, so a changed sell price cannot exist
 * without the cost basis and reason that approved it.
 */
export type PricingApproval = {
  actor: string;
  reason: string;
  modelName: string;
  costSource: "synced" | "manual" | "unknown";
  costInputMicros: number;
  costOutputMicros: number;
  targetMarginBps: number | null;
  rounding: string | null;
  recommendationJson: string;
};

export async function setModelPricing(
  db: PostgresDatabase,
  modelId: string,
  sellInputMicros: number,
  sellOutputMicros: number,
  approval?: PricingApproval,
) {
  const row = await db
    .prepare(
      `${MODEL_SELECT}
       WHERE m.id = ?`,
    )
    .get<ModelRow>(modelId);

  if (!row || accessFor(row) === "free") return false;

  const afterInput = Math.max(0, Math.round(sellInputMicros));
  const afterOutput = Math.max(0, Math.round(sellOutputMicros));
  let updated = false;

  await db.transaction(async () => {
    const result = await db
      .prepare(
        `UPDATE models
              SET sell_input_micros = ?, sell_output_micros = ?,
                  price_source = 'manual'
            WHERE id = ?`,
      )
      .run(afterInput, afterOutput, modelId);

    if (result.changes === 0) return;

    updated = true;

    if (!approval) return;

    await recordPricingDecision(db, {
      modelId,
      modelName: approval.modelName,
      actor: approval.actor,
      reason: approval.reason,
      costSource: approval.costSource,
      costInputMicros: approval.costInputMicros,
      costOutputMicros: approval.costOutputMicros,
      beforeInputMicros: Number(row.sell_input_micros),
      beforeOutputMicros: Number(row.sell_output_micros),
      afterInputMicros: afterInput,
      afterOutputMicros: afterOutput,
      targetMarginBps: approval.targetMarginBps,
      rounding: approval.rounding,
      recommendationJson: approval.recommendationJson,
    });
  })();

  if (updated) await reconcileRoutes(db);

  return updated;
}

export async function getModelForGateway(
  db: PostgresDatabase,
  modelId: string,
): Promise<GatewayModel | undefined> {
  const row = await db
    .prepare(
      `${MODEL_SELECT}
       WHERE m.id = ?`,
    )
    .get<ModelRow>(modelId);

  return row ? toGatewayModel(row) : undefined;
}

/**
 * Resolves an unscoped upstream id only when exactly one provider publishes it.
 * Ambiguous ids must use the namespaced public id.
 */
export async function getModelByUpstreamId(
  db: PostgresDatabase,
  upstreamId: string,
): Promise<GatewayModel | undefined> {
  const rows = await db
    .prepare(
      `${MODEL_SELECT}
       WHERE m.upstream_id = ?`,
    )
    .all<ModelRow>(upstreamId);

  return rows.length === 1 ? toGatewayModel(rows[0]) : undefined;
}

export async function applyCatalogMarkup(
  db: PostgresDatabase,
  markupBps: number,
  applyToAll: boolean,
) {
  const rows = await db
    .prepare(
      `${MODEL_SELECT}
       WHERE m.in_catalog = 1`,
    )
    .all<ModelRow>();
  const update = db.prepare(
    `UPDATE models
        SET sell_input_micros = ?, sell_output_micros = ?, price_source = 'auto'
      WHERE id = ?`,
  );

  let changed = 0;

  await db.transaction(async () => {
    for (const row of rows) {
      if (accessFor(row) === "free") {
        await update.run(0, 0, row.id);
        changed += 1;
        continue;
      }

      if (!applyToAll && row.price_source === "manual") continue;

      await update.run(
        defaultSellMicros(Number(row.input_price_micros), markupBps),
        defaultSellMicros(Number(row.output_price_micros), markupBps),
        row.id,
      );
      changed += 1;
    }
  })();

  await reconcileRoutes(db);

  return changed;
}
