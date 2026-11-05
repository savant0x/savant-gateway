import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ModelRow } from "../../projections.ts";
import type { PricingApproval } from "./models.ts";
import type { PricingVersion } from "../../pricing-command.ts";

import { accessFor } from "../../projections.ts";
import { pricingVersionMatches } from "../../pricing-command.ts";

import { MODEL_SELECT } from "./model-sql.ts";
import { recordPricingDecision } from "./pricing-decisions.ts";
import { reconcileRoutes } from "./routes.ts";

/**
 * Version-checked price approval (FID-2026-1105-005, step 3).
 *
 * The preview the operator saw names four integers: the current sell price and
 * the serving route's cost, both directions. Approval sends them back. The
 * update includes all four in its `WHERE`, so a price or a cost that moved
 * between preview and approval changes zero rows. That is a 409, not a silent
 * reprice and not a second decision row.
 *
 * The check and the decision row commit together. `setModelPricing` could not
 * be reused: it reads the row before the transaction and then updates
 * unconditionally, which is exactly the race this closes.
 */

export type PricingVersionCheck =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "free" }
  | { status: "stale"; current: PricingVersion };

/**
 * The same numbers `toAdminModelSummary` shows the preview: the serving
 * route's cost snapshot (falling back to the row's own cost) and the row's
 * current sell price.
 */
export function currentPricingVersion(row: ModelRow): PricingVersion {
  return {
    sellInputMicros: Number(row.sell_input_micros),
    sellOutputMicros: Number(row.sell_output_micros),
    costInputMicros: Number(
      row.served_cost_input_micros ?? row.input_price_micros,
    ),
    costOutputMicros: Number(
      row.served_cost_output_micros ?? row.output_price_micros,
    ),
  };
}

export async function setModelPricingChecked(
  db: PostgresDatabase,
  modelId: string,
  sellInputMicros: number,
  sellOutputMicros: number,
  expected: PricingVersion,
  approval: PricingApproval,
): Promise<PricingVersionCheck> {
  const row = await db
    .prepare(
      `${MODEL_SELECT}
       WHERE m.id = ?`,
    )
    .get<ModelRow>(modelId);

  if (!row) return { status: "not_found" };
  if (accessFor(row) === "free") return { status: "free" };

  const current = currentPricingVersion(row);

  if (!pricingVersionMatches(expected, current)) {
    return { status: "stale", current };
  }

  const afterInput = Math.max(0, Math.round(sellInputMicros));
  const afterOutput = Math.max(0, Math.round(sellOutputMicros));
  let updated = false;

  await db.transaction(async () => {
    const result = await db
      .prepare(
        `UPDATE models
            SET sell_input_micros = ?, sell_output_micros = ?,
                price_source = 'manual'
          WHERE id = ?
            AND sell_input_micros = ?
            AND sell_output_micros = ?
            AND COALESCE(served_cost_input_micros, input_price_micros) = ?
            AND COALESCE(served_cost_output_micros, output_price_micros) = ?`,
      )
      .run(
        afterInput,
        afterOutput,
        modelId,
        current.sellInputMicros,
        current.sellOutputMicros,
        current.costInputMicros,
        current.costOutputMicros,
      );

    if (result.changes === 0) return;

    updated = true;

    await recordPricingDecision(db, {
      modelId,
      modelName: approval.modelName,
      actor: approval.actor,
      reason: approval.reason,
      costSource: approval.costSource,
      costInputMicros: approval.costInputMicros,
      costOutputMicros: approval.costOutputMicros,
      beforeInputMicros: current.sellInputMicros,
      beforeOutputMicros: current.sellOutputMicros,
      afterInputMicros: afterInput,
      afterOutputMicros: afterOutput,
      targetMarginBps: approval.targetMarginBps,
      rounding: approval.rounding,
      recommendationJson: approval.recommendationJson,
    });
  })();

  if (updated) await reconcileRoutes(db);

  return updated ? { status: "ok" } : { status: "stale", current };
}
