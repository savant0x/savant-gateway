/**
 * Completion rate limiting at the gateway boundary.
 *
 * The upstream free plan permits 15 requests per minute for the whole account,
 * shared by every customer. Nothing stopped one free key from spending all of
 * it, so free traffic draws from one shared bucket, while paid traffic shares a
 * bucket per customer across their keys.
 *
 * This module keeps bucket identity and the pure decision. The bucket state is
 * persisted in PostgreSQL by `lib/storage/admission.ts`, so the ceiling is one
 * aggregate number across application instances (FID-2026-1104-004).
 */
import {
  retryAfterSeconds,
  takeToken,
  type BucketState,
  type BucketConfig,
} from "./token-bucket.ts";

export const DEFAULT_FREE_SHARED_RPM = 12;
export const DEFAULT_PAID_KEY_RPM = 60;

export type RateLimitConfig = {
  freeSharedRpm: number;
  paidKeyRpm: number;
};

export type CompletionBucket = {
  scope: "free" | "paid";
  key: string;
  limit: number;
};

export type CompletionRateDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export type RateLimitDecision = CompletionRateDecision & {
  scope: "free" | "paid";
  limit: number;
  /** The shared store could not answer; the caller must fail closed. */
  unavailable?: true;
};

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);

  return value !== undefined &&
    value !== null &&
    value !== "" &&
    Number.isSafeInteger(parsed) &&
    parsed > 0
    ? parsed
    : fallback;
}

/**
 * `FREE_SHARED_RPM` defaults below the upstream 15 RPM allowance so that
 * operator probes and in-flight retries still fit; `PAID_KEY_RPM` is generous
 * because one paid key driving an agent legitimately bursts.
 */
export function readRateLimitConfig(
  env: Record<string, string | undefined> = process.env,
): RateLimitConfig {
  return {
    freeSharedRpm: positiveInteger(
      env.FREE_SHARED_RPM,
      DEFAULT_FREE_SHARED_RPM,
    ),
    paidKeyRpm: positiveInteger(env.PAID_KEY_RPM, DEFAULT_PAID_KEY_RPM),
  };
}

/**
 * Free traffic has one key. Paid traffic is per customer, not per key, so
 * issuing another key cannot multiply dispatch capacity.
 */
export function completionBucket(input: {
  keyId: string;
  userId?: string;
  free: boolean;
  config?: RateLimitConfig;
}): CompletionBucket {
  const config = input.config ?? readRateLimitConfig();

  return input.free
    ? { scope: "free", key: "free", limit: config.freeSharedRpm }
    : {
        scope: "paid",
        key: `paid:${input.userId ?? input.keyId}`,
        limit: config.paidKeyRpm,
      };
}

/**
 * Applies one request to an observed bucket. A full minute of allowance may
 * arrive at once; it refills over the minute.
 */
export function evaluateCompletionRate(input: {
  state: BucketState | undefined;
  now: number;
  limit: number;
}): { decision: CompletionRateDecision; state: BucketState } {
  return evaluate(input.state, input.now, {
    capacity: input.limit,
    refillPerMinute: input.limit,
  });
}

function evaluate(
  state: BucketState | undefined,
  now: number,
  config: BucketConfig,
) {
  const decision = takeToken(state, now, config);

  return {
    decision: {
      allowed: decision.allowed,
      remaining: decision.remaining,
      retryAfterSeconds: retryAfterSeconds(decision.retryAfterMs),
    },
    state: decision.state,
  };
}
