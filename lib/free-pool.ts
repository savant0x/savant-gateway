/**
 * Free models draw on one shared, weighted upstream pool. These limits are the
 * local guardrail: each user gets a daily weighted-token allowance, and the
 * gateway stops admitting free calls before the known provider pool runs dry.
 */
export const DEFAULT_FREE_DAILY_WEIGHTED_TOKENS = 500_000;
export const DEFAULT_FREE_PROVIDER_REMAINING_FLOOR = 1_000_000;
export const DEFAULT_FREE_PROVIDER_ALERT_THRESHOLD = 2_000_000;
export const FREE_PROVIDER_RETRY_SECONDS = 300;

export type FreePoolConfig = {
  dailyWeightedTokens: number;
  providerRemainingFloor: number;
  providerAlertThreshold: number;
};

export type FreeAdmissionAllowed = {
  allowed: true;
  estimatedWeightedTokens: number;
  providerRemaining: number | null;
  alert: boolean;
};

export type FreeAdmissionBlocked = {
  allowed: false;
  reason:
    | "provider_blocked"
    | "provider_pool"
    | "provider_unavailable"
    | "user_allowance"
    | "trial_exhausted";
  status: 402 | 429 | 503;
  type: "insufficient_quota" | "rate_limit_error";
  message: string;
  retryAfterSeconds: number;
  resetAt: string | null;
};

export type FreeAdmission = FreeAdmissionAllowed | FreeAdmissionBlocked;

function positiveInt(raw: string | undefined, fallback: number) {
  const value = Number(raw);

  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function readFreePoolConfig(
  env: Record<string, string | undefined> = process.env,
): FreePoolConfig {
  return {
    dailyWeightedTokens: positiveInt(
      env.FREE_DAILY_WEIGHTED_TOKENS,
      DEFAULT_FREE_DAILY_WEIGHTED_TOKENS,
    ),
    providerRemainingFloor: positiveInt(
      env.FREE_PROVIDER_REMAINING_FLOOR,
      DEFAULT_FREE_PROVIDER_REMAINING_FLOOR,
    ),
    providerAlertThreshold: positiveInt(
      env.FREE_PROVIDER_ALERT_THRESHOLD,
      DEFAULT_FREE_PROVIDER_ALERT_THRESHOLD,
    ),
  };
}

export function estimateWeightedTokens(
  promptTokens: number,
  outputBudget: number,
  tokenWeight: number,
) {
  const weight = Math.max(1, Math.floor(tokenWeight) || 1);
  const raw =
    Math.max(0, Math.floor(promptTokens)) +
    Math.max(0, Math.floor(outputBudget));

  return Math.max(1, raw * weight);
}

export function nextUtcReset(now = Date.now()) {
  const date = new Date(now);

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  );
}

export function secondsUntilReset(now = Date.now()) {
  return Math.max(60, Math.ceil((nextUtcReset(now).getTime() - now) / 1000));
}

export function decideFreeAdmission(input: {
  config: FreePoolConfig;
  promptTokens: number;
  outputBudget: number;
  tokenWeight: number;
  usedWeightedTokens: number;
  reservedWeightedTokens: number;
  providerRemaining: number | null;
  providerAllowed: boolean | null;
  providerUnlimited?: boolean;
  now?: number;
}): FreeAdmission {
  const now = input.now ?? Date.now();
  const estimatedWeightedTokens = estimateWeightedTokens(
    input.promptTokens,
    input.outputBudget,
    input.tokenWeight,
  );
  const retryAfterSeconds = secondsUntilReset(now);

  if (input.providerAllowed === false) {
    return {
      allowed: false,
      reason: "provider_blocked",
      status: 429,
      type: "insufficient_quota",
      message:
        "The shared free pool is not accepting requests right now. Try again later or use a paid model.",
      retryAfterSeconds: FREE_PROVIDER_RETRY_SECONDS,
      resetAt: null,
    };
  }

  if (
    input.providerAllowed === null ||
    (input.providerRemaining === null && !input.providerUnlimited)
  ) {
    return {
      allowed: false,
      reason: "provider_unavailable",
      status: 503,
      type: "insufficient_quota",
      message:
        "Current upstream free capacity is unavailable. Try again shortly.",
      retryAfterSeconds: 5,
      resetAt: null,
    };
  }

  if (
    !input.providerUnlimited &&
    input.providerRemaining !== null &&
    input.providerRemaining - estimatedWeightedTokens <
      input.config.providerRemainingFloor
  ) {
    return {
      allowed: false,
      reason: "provider_pool",
      status: 429,
      type: "insufficient_quota",
      message:
        "The shared free pool is nearly exhausted. Try again later or use a paid model.",
      retryAfterSeconds: FREE_PROVIDER_RETRY_SECONDS,
      resetAt: null,
    };
  }

  const committed =
    Math.max(0, input.usedWeightedTokens) +
    Math.max(0, input.reservedWeightedTokens) +
    estimatedWeightedTokens;

  if (committed > input.config.dailyWeightedTokens) {
    const resetAt = nextUtcReset(now).toISOString();

    return {
      allowed: false,
      reason: "user_allowance",
      status: 429,
      type: "rate_limit_error",
      message: `Daily trial-credit allocation reached (${input.config.dailyWeightedTokens.toLocaleString("en-US")} weighted tokens). Resets at ${resetAt}.`,
      retryAfterSeconds,
      resetAt,
    };
  }

  return {
    allowed: true,
    estimatedWeightedTokens,
    providerRemaining: input.providerRemaining,
    alert:
      input.providerRemaining !== null &&
      input.providerRemaining <= input.config.providerAlertThreshold,
  };
}
