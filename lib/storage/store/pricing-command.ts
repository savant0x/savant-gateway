import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ModelAccess } from "../../types.ts";
import type {
  PricingCommandCostSource,
  PricingCommandData,
  PricingCommandRow,
} from "../../pricing-command.ts";

import {
  PRICING_COMMAND_MAX_ROWS,
  normalizePricingWindow,
  pricingWindowCutoff,
} from "../../pricing-command.ts";
import { marginBps } from "../../pricing.ts";

/**
 * Pricing command-center read (FID-2026-1105-005).
 *
 * One grouped read over `usage_events` for the trailing window, restricted to
 * `billing_source = 'credit'`. That restriction is the contract: free calls,
 * included plan usage and overage are owned by their own surfaces, and summing
 * them here would present a cost problem as a pricing problem. Revenue is what
 * the gateway settled, not what a list price implies.
 *
 * The join to `models` is what lets the page show the current rate beside the
 * realized one. A model that has been deleted from the catalog still keeps its
 * usage rows; it appears with its persisted revenue but an unknown cost basis,
 * because a missing row is not evidence that the cost was zero.
 */

type CommandSqlRow = {
  model_id: string;
  requests: number | string;
  input_tokens: number | string;
  output_tokens: number | string;
  revenue_micros: number | string;
  recorded_cost_micros: number | string;
  name: string | null;
  family: string | null;
  group_slug: string | null;
  group_billing_mode: string | null;
  allow_free: number | string | null;
  sell_input_micros: number | string | null;
  sell_output_micros: number | string | null;
  cost_input_micros: number | string | null;
  cost_output_micros: number | string | null;
  cost_source: string | null;
  cost_observed_at: string | null;
  model_present: number | string;
  in_catalog: number | string | null;
};

/**
 * `MAX` on every model column is safe because the grouping key is the model id:
 * all joined model rows are the same row. It also keeps PostgreSQL happy
 * without listing twelve non-aggregated expressions in `GROUP BY`.
 */
const COMMAND_SELECT = `
  SELECT u.model_id AS model_id,
         COUNT(*) AS requests,
         COALESCE(SUM(u.input_tokens), 0) AS input_tokens,
         COALESCE(SUM(u.output_tokens), 0) AS output_tokens,
         COALESCE(SUM(u.charged_micros), 0) AS revenue_micros,
         COALESCE(SUM(u.cost_micros), 0) AS recorded_cost_micros,
         MAX(m.name) AS name,
         MAX(COALESCE(m.family, m.provider)) AS family,
         MAX(m.group_slug) AS group_slug,
         MAX(g.billing_mode) AS group_billing_mode,
         MAX(m.allow_free) AS allow_free,
         MAX(m.sell_input_micros) AS sell_input_micros,
         MAX(m.sell_output_micros) AS sell_output_micros,
         MAX(m.input_price_micros) AS cost_input_micros,
         MAX(m.output_price_micros) AS cost_output_micros,
         MAX(m.cost_source) AS cost_source,
         MAX(m.cost_observed_at) AS cost_observed_at,
         MAX(CASE WHEN m.id IS NULL THEN 0 ELSE 1 END) AS model_present,
         MAX(m.in_catalog) AS in_catalog
    FROM usage_events u
    LEFT JOIN models m ON m.id = u.model_id
    LEFT JOIN model_groups g ON g.slug = m.group_slug
   WHERE u.billing_source = 'credit'
     AND u.created_at::timestamptz >= ?::timestamptz
     AND u.created_at::timestamptz <= ?::timestamptz
   GROUP BY u.model_id
   ORDER BY SUM(u.charged_micros) DESC, u.model_id ASC
   LIMIT ?
`;

function accessForRow(row: CommandSqlRow): ModelAccess {
  if (
    row.group_billing_mode === "free" ||
    row.group_billing_mode === "paid" ||
    row.group_billing_mode === "subscription"
  ) {
    return row.group_billing_mode;
  }

  return Number(row.allow_free ?? 0) === 1 ? "free" : "paid";
}

function costSourceForRow(row: CommandSqlRow): PricingCommandCostSource {
  if (Number(row.model_present) === 0) return "unknown";

  return row.cost_source === "manual" || row.cost_source === "synced"
    ? row.cost_source
    : "unknown";
}

function toCommandRow(row: CommandSqlRow): PricingCommandRow {
  const requests = Number(row.requests);
  const revenueMicros = Number(row.revenue_micros);
  const costSource = costSourceForRow(row);
  const costKnown = costSource !== "unknown";
  const costMicros = costKnown ? Number(row.recorded_cost_micros) : null;
  const contributionMicros =
    costMicros === null ? null : revenueMicros - costMicros;

  return {
    modelId: row.model_id,
    modelName: row.name ?? row.model_id,
    family: row.family ?? "—",
    groupSlug: row.group_slug ?? accessForRow(row),
    access: accessForRow(row),
    requests,
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    revenueMicros,
    costMicros,
    contributionMicros,
    marginBps:
      costMicros === null ? null : marginBps(costMicros, revenueMicros),
    unknownCostRequests: costKnown ? 0 : requests,
    coverageBps: costKnown ? 10_000 : 0,
    sellInputMicros: Number(row.sell_input_micros ?? 0),
    sellOutputMicros: Number(row.sell_output_micros ?? 0),
    costInputMicros: Number(row.cost_input_micros ?? 0),
    costOutputMicros: Number(row.cost_output_micros ?? 0),
    costSource,
    costObservedAt: costKnown ? (row.cost_observed_at ?? null) : null,
    inCatalog: Number(row.in_catalog ?? 0) === 1,
  };
}

function summarize(
  rows: PricingCommandRow[],
  rangeDays: number,
): PricingCommandData["summary"] {
  let requests = 0;
  let revenueMicros = 0;
  let knownRevenueMicros = 0;
  let costMicros = 0;
  let contributionMicros = 0;
  let knownRequests = 0;

  for (const row of rows) {
    requests += row.requests;
    revenueMicros += row.revenueMicros;

    if (row.costMicros === null || row.contributionMicros === null) continue;

    knownRequests += row.requests;
    knownRevenueMicros += row.revenueMicros;
    costMicros += row.costMicros;
    contributionMicros += row.contributionMicros;
  }

  return {
    rangeDays,
    models: rows.length,
    requests,
    revenueMicros,
    knownRevenueMicros,
    costMicros,
    contributionMicros,
    marginBps:
      knownRevenueMicros > 0
        ? Math.round((contributionMicros / knownRevenueMicros) * 10_000)
        : null,
    unknownCostRequests: requests - knownRequests,
    coverageBps:
      requests > 0 ? Math.round((knownRequests / requests) * 10_000) : 10_000,
  };
}

export async function getPricingCommand(
  db: PostgresDatabase,
  rangeDays = 30,
  now = new Date().toISOString(),
): Promise<PricingCommandData> {
  const windowDays = normalizePricingWindow(rangeDays);
  const cutoff = pricingWindowCutoff(now, windowDays);
  const rows = await db
    .prepare(COMMAND_SELECT)
    .all<CommandSqlRow>(cutoff, now, PRICING_COMMAND_MAX_ROWS);
  const mapped = rows.map(toCommandRow);

  return {
    generatedAt: now,
    rangeDays: windowDays,
    rows: mapped,
    summary: summarize(mapped, windowDays),
  };
}
