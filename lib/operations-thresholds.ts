import type { OperationsThresholds } from "./operations-types.ts";

const DAY_SECONDS = 86_400;

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

/** Malformed values fall back to the guard's default, never to "off". */
export function readOperationsThresholds(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OperationsThresholds {
  return {
    windowMinutes: readInt(env, "OPERATIONS_WINDOW_MINUTES", 60, 5, 1440),
    minRequests: readInt(env, "OPERATIONS_MIN_REQUESTS", 20, 1, 100_000),
    errorRateBps: readInt(env, "OPERATIONS_ERROR_RATE_BPS", 1000, 1, 10_000),
    settlementMaxAgeSeconds: readInt(
      env,
      "OPERATIONS_SETTLEMENT_MAX_AGE_SECONDS",
      900,
      60,
      DAY_SECONDS,
    ),
    paymentMaxAgeSeconds: readInt(
      env,
      "OPERATIONS_PAYMENT_MAX_AGE_SECONDS",
      1800,
      60,
      DAY_SECONDS,
    ),
    quotaMaxAgeSeconds: readInt(
      env,
      "OPERATIONS_QUOTA_MAX_AGE_SECONDS",
      120,
      30,
      3600,
    ),
    reserveMinTokens: readInt(
      env,
      "OPERATIONS_RESERVE_MIN_TOKENS",
      0,
      0,
      1_000_000_000_000,
    ),
    databaseMaxBytes: readInt(
      env,
      "OPERATIONS_DATABASE_MAX_BYTES",
      0,
      0,
      1_000_000_000_000,
    ),
    backupMaxAgeSeconds: readInt(
      env,
      "OPERATIONS_BACKUP_MAX_AGE_SECONDS",
      0,
      0,
      30 * DAY_SECONDS,
    ),
    alertMaxAttempts: readInt(env, "OPERATIONS_ALERT_MAX_ATTEMPTS", 3, 1, 5),
    alertRetrySeconds: readInt(
      env,
      "OPERATIONS_ALERT_RETRY_SECONDS",
      60,
      10,
      3600,
    ),
  };
}
