import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  ProviderCapitalData,
  ProviderCapitalInput,
} from "../../provider-capital.ts";
import type {
  EconomicAlertInput,
  EconomicMarginRow,
} from "../../operations-economics.ts";

import {
  CAPITAL_DEFAULT_WINDOW_DAYS,
  normalizeCapitalWindow,
  providerCapitalSummary,
  toProviderCapitalRow,
} from "../../provider-capital.ts";
import { CUSTOMER_SPEND_WINDOW_HOURS } from "../../operations-economics.ts";
import { marginBps } from "../../pricing.ts";
import { providerKeyConfigured } from "../../providers/registry.ts";

/**
 * Provider capital reads (FID-2026-1105-006).
 *
 * Spend attribution uses `usage_events.provider_slug`, which settlement writes
 * from `GatewayModel.upstreamSlug` — the serving route's slug, not the model
 * owner's. That is what makes "capital spent at this provider" true after the
 * cheap-route election moves a model between providers.
 *
 * A provider that was deleted but still has usage history is appended as a
 * disabled row rather than dropped: its cost is real, and hiding it would make
 * the recorded spend total disagree with the ledger.
 */

type ProviderSqlRow = {
  slug: string;
  label: string;
  enabled: number | string;
  key_env_var: string;
  supports_balance: number | string;
  balance_usd: number | string | null;
  balance_observed_at: string | null;
};

type SpendSqlRow = {
  slug: string;
  spend_micros: number | string;
  covered_days: number | string;
};

type DependencySqlRow = { slug: string; models: number | string };

type MarginSqlRow = {
  id: string;
  name: string;
  sell_input_micros: number | string;
  sell_output_micros: number | string;
  cost_input_micros: number | string;
  cost_output_micros: number | string;
  cost_source: string;
  cost_observed_at: string | null;
};

type CustomerSpendSqlRow = {
  user_id: string;
  spend_micros: number | string;
};

export async function getProviderCapital(
  db: PostgresDatabase,
  now = new Date().toISOString(),
  windowDays = CAPITAL_DEFAULT_WINDOW_DAYS,
): Promise<ProviderCapitalData> {
  const rangeDays = normalizeCapitalWindow(windowDays);
  const cutoff = new Date(
    Date.parse(now) - rangeDays * 86_400_000,
  ).toISOString();
  const [providers, spend, dependencies] = await Promise.all([
    db
      .prepare("SELECT * FROM providers ORDER BY sort_order ASC, slug ASC")
      .all<ProviderSqlRow>(),
    db
      .prepare(
        `SELECT provider_slug AS slug,
                COALESCE(SUM(cost_micros), 0) AS spend_micros,
                COUNT(DISTINCT to_char(created_at::timestamptz, 'YYYY-MM-DD'))
                  AS covered_days
           FROM usage_events
          WHERE created_at::timestamptz >= ?::timestamptz
            AND created_at::timestamptz <= ?::timestamptz
          GROUP BY provider_slug`,
      )
      .all<SpendSqlRow>(cutoff, now),
    db
      .prepare(
        `SELECT upstream_slug AS slug, COUNT(*) AS models
           FROM models
          WHERE in_catalog = 1 AND status = 'active'
          GROUP BY upstream_slug`,
      )
      .all<DependencySqlRow>(),
  ]);
  const spendBySlug = new Map(spend.map((row) => [row.slug, row] as const));
  const dependencyBySlug = new Map(
    dependencies.map((row) => [row.slug, Number(row.models)] as const),
  );
  const rows: ProviderCapitalInput[] = providers.map((row) => {
    const spending = spendBySlug.get(row.slug);

    return {
      slug: row.slug,
      label: row.label,
      enabled: Number(row.enabled) === 1,
      configured:
        row.key_env_var !== "" && providerKeyConfigured(row.key_env_var),
      supportsBalance: Number(row.supports_balance) === 1,
      balanceUsd: row.balance_usd === null ? null : Number(row.balance_usd),
      balanceObservedAt: row.balance_observed_at,
      spendMicros: spending ? Number(spending.spend_micros) : 0,
      coveredDays: spending ? Number(spending.covered_days) : 0,
      dependentModels: dependencyBySlug.get(row.slug) ?? 0,
      windowDays: rangeDays,
    };
  });
  const known = new Set(rows.map((row) => row.slug));

  // A deleted provider keeps its spend visible as a disabled, unconfigured row.
  for (const spending of spend) {
    if (known.has(spending.slug)) continue;

    rows.push({
      slug: spending.slug,
      label: spending.slug,
      enabled: false,
      configured: false,
      supportsBalance: false,
      balanceUsd: null,
      balanceObservedAt: null,
      spendMicros: Number(spending.spend_micros),
      coveredDays: Number(spending.covered_days),
      dependentModels: dependencyBySlug.get(spending.slug) ?? 0,
      windowDays: rangeDays,
    });
  }

  const mapped = rows.map((row) => toProviderCapitalRow(row, now));

  return {
    generatedAt: now,
    windowDays: rangeDays,
    rows: mapped,
    summary: providerCapitalSummary(mapped),
  };
}

/**
 * The additional inputs the economic rules need. Margin is computed from the
 * serving route's cost snapshot, the same basis settlement uses. Customer
 * spend is de-identified to a user id in the incident text.
 */
export async function getEconomicAlertInput(
  db: PostgresDatabase,
  input: {
    now: string;
    windowDays: number;
    customerSpendMicros: number;
  },
): Promise<EconomicAlertInput> {
  const capital = await getProviderCapital(db, input.now, input.windowDays);
  const marginRows = await db
    .prepare(
      `SELECT id, name, sell_input_micros, sell_output_micros,
              COALESCE(served_cost_input_micros, input_price_micros)
                AS cost_input_micros,
              COALESCE(served_cost_output_micros, output_price_micros)
                AS cost_output_micros,
              cost_source, cost_observed_at
         FROM models
        WHERE in_catalog = 1 AND status = 'active'`,
    )
    .all<MarginSqlRow>();
  const margins: EconomicMarginRow[] = marginRows.map((row) => ({
    modelId: row.id,
    modelName: row.name,
    inputMarginBps: marginBps(
      Number(row.cost_input_micros),
      Number(row.sell_input_micros),
    ),
    outputMarginBps: marginBps(
      Number(row.cost_output_micros),
      Number(row.sell_output_micros),
    ),
    costSource:
      row.cost_source === "manual" || row.cost_source === "synced"
        ? row.cost_source
        : "unknown",
    costObservedAt: row.cost_observed_at,
  }));
  let customerSpend: EconomicAlertInput["customerSpend"] = [];

  if (input.customerSpendMicros > 0) {
    const cutoff = new Date(
      Date.parse(input.now) - CUSTOMER_SPEND_WINDOW_HOURS * 3_600_000,
    ).toISOString();
    const rows = await db
      .prepare(
        `SELECT user_id, COALESCE(SUM(charged_micros), 0) AS spend_micros
           FROM usage_events
          WHERE billing_source = 'credit'
            AND created_at::timestamptz >= ?::timestamptz
          GROUP BY user_id
         HAVING COALESCE(SUM(charged_micros), 0) >= ?
          ORDER BY spend_micros DESC
          LIMIT 20`,
      )
      .all<CustomerSpendSqlRow>(cutoff, input.customerSpendMicros);

    customerSpend = rows.map((row) => ({
      userId: row.user_id,
      spendMicros: Number(row.spend_micros),
    }));
  }

  return { capital: capital.rows, margins, customerSpend };
}
