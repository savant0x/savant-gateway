import type { ProviderCapitalRow } from "./provider-capital.ts";

export const CUSTOMER_SPEND_WINDOW_HOURS = 24;

/**
 * Economic alert settings (FID-2026-1105-006).
 *
 * The master switch is default-off: a deployment that upgrades this code must
 * not start paging on runway or margin until the operator has set a threshold
 * that matches the business. When it is on, a malformed threshold falls back to
 * the documented guard instead of becoming zero or infinity.
 *
 * A zero secondary threshold disables that rule. The master switch still has
 * to be on, so "0" cannot silently enable anything.
 */
export type EconomicAlertThresholds = {
  enabled: boolean;
  capitalWindowDays: number;
  runwayMinDays: number;
  marginFloorBps: number;
  staleCostHours: number;
  customerSpendMicros: number;
};

export type EconomicMarginRow = {
  modelId: string;
  modelName: string;
  inputMarginBps: number | null;
  outputMarginBps: number | null;
  costSource: "synced" | "manual" | "unknown";
  costObservedAt: string | null;
};

export type EconomicAlertInput = {
  capital: ProviderCapitalRow[];
  margins: EconomicMarginRow[];
  customerSpend: Array<{ userId: string; spendMicros: number }>;
};

function readInt(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const raw = env[name]?.trim();

  if (!raw) return fallback;

  const value = Number(raw);

  if (!Number.isInteger(value) || value < min || value > max) return fallback;

  return value;
}

export function readEconomicAlertThresholds(
  env: Readonly<Record<string, string | undefined>> = process.env,
): EconomicAlertThresholds {
  return {
    enabled: env.OPERATIONS_ECONOMIC_ALERTS?.trim() === "1",
    capitalWindowDays: readInt(
      env,
      "OPERATIONS_CAPITAL_WINDOW_DAYS",
      30,
      7,
      365,
    ),
    runwayMinDays: readInt(env, "OPERATIONS_RUNWAY_MIN_DAYS", 7, 1, 365),
    marginFloorBps: readInt(env, "OPERATIONS_MARGIN_FLOOR_BPS", 0, 0, 9_900),
    staleCostHours: readInt(env, "OPERATIONS_STALE_COST_HOURS", 72, 0, 8_760),
    customerSpendMicros: readInt(
      env,
      "OPERATIONS_CUSTOMER_SPEND_MICROS",
      0,
      0,
      1_000_000_000_000,
    ),
  };
}
