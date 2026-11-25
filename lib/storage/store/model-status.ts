import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ModelRow } from "../../projections.ts";
import type { EligibilityDecision } from "../../providers/eligibility.ts";

import { isModelEligible } from "../../providers/eligibility.ts";
import { accessFor } from "../../projections.ts";

import { reconcileRoutes } from "./routes.ts";

/**
 * The catalog switch: one model, or a provider's selection.
 *
 * Both paths read the same columns and run the same `enableBlocker`, because the
 * only difference the operator asked for is how many rows one press touches. A
 * bulk switch that re-derived its own rules would be a second, quieter policy
 * surface for turning a provider on (FID-2026-1123-003).
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
    | "id"
    | "cost_source"
    | "in_catalog"
    | "input_price_micros"
    | "output_price_micros"
    | "sell_input_micros"
    | "sell_output_micros"
  > & {
    requires_model_review: number;
    eligibility_decision: EligibilityDecision | null;
  };

/**
 * The columns a status decision reads. One query text, so the single switch and
 * the bulk switch cannot disagree about which facts decide a row (FID-2026-1123-003).
 */
const STATUS_ROW_SELECT = `SELECT m.id, m.allow_free, m.token_weight,
         m.upstream_id, m.group_slug, m.in_catalog, m.cost_source,
         m.input_price_micros, m.output_price_micros,
         m.sell_input_micros, m.sell_output_micros,
         p.requires_model_review, me.decision AS eligibility_decision,
         g.billing_mode AS group_billing_mode
    FROM models m
    JOIN providers p ON p.slug = m.upstream_slug
    LEFT JOIN model_eligibility me
      ON me.provider_slug = m.upstream_slug
     AND me.upstream_id = m.upstream_id
    LEFT JOIN model_groups g ON g.slug = m.group_slug`;

/**
 * Why an *enable* is refused, in the order the operator can fix them. A free
 * row is priced by definition, so only paid access can be `cost_unknown`.
 * Disabling is never refused: switching a model off is the safe direction.
 */
function enableBlocker(row: StatusRow): "not_eligible" | "cost_unknown" | null {
  const free = accessFor(row) === "free";

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
      !free &&
      (Number(row.input_price_micros) <= 0 ||
        Number(row.output_price_micros) <= 0 ||
        Number(row.sell_input_micros) <= 0 ||
        Number(row.sell_output_micros) <= 0)
    ) {
      return "cost_unknown";
    }

    return null;
  }

  return !free && row.cost_source === "unknown" ? "cost_unknown" : null;
}

export type ModelStatusResult =
  "ok" | "not_found" | "delisted" | "cost_unknown" | "not_eligible";

export async function setModelStatus(
  db: PostgresDatabase,
  modelId: string,
  status: "active" | "disabled",
): Promise<ModelStatusResult> {
  if (status === "active") {
    const row = await db
      .prepare(`${STATUS_ROW_SELECT} WHERE m.id = ?`)
      .get<StatusRow>(modelId);

    if (!row) return "not_found";

    // A delisted row is not in the provider's catalog any more. Enabling it
    // would publish nothing and would claim a model upstream no longer serves.
    if (Number(row.in_catalog) !== 1) return "delisted";

    const blocker = enableBlocker(row);

    if (blocker) return blocker;
  }

  const result = await db
    .prepare("UPDATE models SET status = ? WHERE id = ?")
    .run(status, modelId);

  if (result.changes > 0) await reconcileRoutes(db);

  return result.changes > 0 ? "ok" : "not_found";
}

/** A selection is capped so one request cannot rewrite the whole market. */
export const MAX_BULK_STATUS = 1000;

export type ModelStatusSkipReason =
  "not_found" | "delisted" | "not_eligible" | "cost_unknown";

export type ModelStatusSkip = { id: string; reason: ModelStatusSkipReason };

export type BulkStatusOutcome =
  "empty" | "too_many" | { written: number; skipped: ModelStatusSkip[] };

/**
 * Switches a selection in one transaction with one route reconciliation.
 *
 * Every row goes through the same `enableBlocker` the single switch uses, so a
 * bulk action can never publish a row the single button would refuse — it only
 * reduces the number of presses. Rows that are refused are reported with the
 * reason, never silently skipped, because "I pressed it and nothing happened"
 * is the failure mode this feature exists to remove (FID-2026-1123-003).
 */
export async function setModelStatusBulk(
  db: PostgresDatabase,
  modelIds: string[],
  status: "active" | "disabled",
): Promise<BulkStatusOutcome> {
  const unique = Array.from(
    new Set(modelIds.filter((id) => typeof id === "string" && id !== "")),
  );

  if (unique.length === 0) return "empty";
  if (unique.length > MAX_BULK_STATUS) return "too_many";

  const placeholders = unique.map(() => "?").join(", ");
  const rows = await db
    .prepare(`${STATUS_ROW_SELECT} WHERE m.id IN (${placeholders})`)
    .all<StatusRow>(...unique);
  const found = new Map(rows.map((row) => [row.id, row]));
  const skipped: ModelStatusSkip[] = [];
  const writable: string[] = [];

  for (const id of unique) {
    const row = found.get(id);

    if (!row) {
      skipped.push({ id, reason: "not_found" });
      continue;
    }

    if (status === "active") {
      if (Number(row.in_catalog) !== 1) {
        skipped.push({ id, reason: "delisted" });
        continue;
      }

      const blocker = enableBlocker(row);

      if (blocker) {
        skipped.push({ id, reason: blocker });
        continue;
      }
    }

    writable.push(id);
  }

  let written = 0;

  if (writable.length > 0) {
    // One statement for the selection: the per-id loop cost rows × RTT inside
    // one transaction at catalog size (FID-2026-1124-005).
    const placeholders = writable.map(() => "?").join(", ");
    const result = await db
      .prepare(
        `UPDATE models SET status = ?
          WHERE id IN (${placeholders})`,
      )
      .run(status, ...writable);

    written = Number(result.changes);
  }

  if (written > 0) await reconcileRoutes(db);

  return { written, skipped };
}
