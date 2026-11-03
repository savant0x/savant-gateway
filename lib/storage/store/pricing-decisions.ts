import type { PostgresDatabase } from "../pg-adapter.ts";

import { randomUUID } from "node:crypto";

/**
 * Price approval history (FID-2026-1103-141).
 *
 * The row is written in the same transaction as the price update, so a price
 * cannot change without the reason and cost basis that justified it. Reads are
 * bounded: a chart asks for a recent window, never the whole table.
 */

export type PricingDecisionInput = {
  modelId: string;
  modelName: string;
  actor: string;
  reason: string;
  costSource: "synced" | "manual" | "unknown";
  costInputMicros: number;
  costOutputMicros: number;
  beforeInputMicros: number;
  beforeOutputMicros: number;
  afterInputMicros: number;
  afterOutputMicros: number;
  targetMarginBps: number | null;
  rounding: string | null;
  recommendationJson: string;
};

export type PricingDecision = Omit<
  PricingDecisionInput,
  "recommendationJson"
> & {
  id: string;
  recommendation: Record<string, unknown>;
  createdAt: string;
};

type DecisionRow = {
  id: string;
  model_id: string;
  model_name: string;
  actor: string;
  reason: string;
  cost_source: PricingDecisionInput["costSource"];
  cost_input_micros: number | string;
  cost_output_micros: number | string;
  before_input_micros: number | string;
  before_output_micros: number | string;
  after_input_micros: number | string;
  after_output_micros: number | string;
  target_margin_bps: number | null;
  rounding: string | null;
  recommendation_json: string;
  created_at: string;
};

function toDecision(row: DecisionRow): PricingDecision {
  let recommendation: Record<string, unknown> = {};

  try {
    const parsed = JSON.parse(row.recommendation_json) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      recommendation = parsed as Record<string, unknown>;
    }
  } catch {
    recommendation = {};
  }

  return {
    id: row.id,
    modelId: row.model_id,
    modelName: row.model_name,
    actor: row.actor,
    reason: row.reason,
    costSource: row.cost_source,
    costInputMicros: Number(row.cost_input_micros),
    costOutputMicros: Number(row.cost_output_micros),
    beforeInputMicros: Number(row.before_input_micros),
    beforeOutputMicros: Number(row.before_output_micros),
    afterInputMicros: Number(row.after_input_micros),
    afterOutputMicros: Number(row.after_output_micros),
    targetMarginBps: row.target_margin_bps,
    rounding: row.rounding,
    recommendation,
    createdAt: row.created_at,
  };
}

/** Inserts the audit row. The caller owns the transaction. */
export async function recordPricingDecision(
  db: PostgresDatabase,
  input: PricingDecisionInput,
  now = new Date().toISOString(),
) {
  const id = `pd_${randomUUID()}`;

  await db
    .prepare(
      `INSERT INTO pricing_decisions
        (id, model_id, model_name, actor, reason, cost_source,
         cost_input_micros, cost_output_micros, before_input_micros,
         before_output_micros, after_input_micros, after_output_micros,
         target_margin_bps, rounding, recommendation_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.modelId,
      input.modelName,
      input.actor,
      input.reason,
      input.costSource,
      input.costInputMicros,
      input.costOutputMicros,
      input.beforeInputMicros,
      input.beforeOutputMicros,
      input.afterInputMicros,
      input.afterOutputMicros,
      input.targetMarginBps,
      input.rounding,
      input.recommendationJson,
      now,
    );

  return id;
}

export async function listPricingDecisions(
  db: PostgresDatabase,
  limit = 100,
  modelId?: string,
): Promise<PricingDecision[]> {
  const bound = Math.min(500, Math.max(1, Math.floor(limit)));
  const rows = modelId
    ? await db
        .prepare(
          `SELECT * FROM pricing_decisions
            WHERE model_id = ?
            ORDER BY created_at DESC
            LIMIT ?`,
        )
        .all<DecisionRow>(modelId, bound)
    : await db
        .prepare(
          `SELECT * FROM pricing_decisions
            ORDER BY created_at DESC
            LIMIT ?`,
        )
        .all<DecisionRow>(bound);

  return rows.map(toDecision);
}
