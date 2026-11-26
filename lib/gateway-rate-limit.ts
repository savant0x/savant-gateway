/**
 * Completion rate limiting at the gateway boundary.
 *
 * Every customer shares one bucket across all of their keys, so issuing another
 * key cannot multiply dispatch capacity. The free shared bucket was removed
 * with the free tier (FID-2026-1125-004).
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

export const DEFAULT_PAID_KEY_RPM = 60;

export type RateLimitConfig = {
  paidKeyRpm: number;
};

export type CompletionBucket = {
  scope: "paid";
  key: string;
  limit: number;
};

export type CompletionRateDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export type RateLimitDecision = CompletionRateDecision & {
  scope: "paid";
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
 * `PAID_KEY_RPM` is generous because one paid key driving an agent legitimately
 * bursts.
 */
export function readRateLimitConfig(
  env: Record<string, string | undefined> = process.env,
): RateLimitConfig {
  return {
    paidKeyRpm: positiveInteger(env.PAID_KEY_RPM, DEFAULT_PAID_KEY_RPM),
  };
}

/** Paid traffic is per customer, not per key, so a second key shares the limit. */
export function completionBucket(input: {
  keyId: string;
  userId?: string;
  config?: RateLimitConfig;
}): CompletionBucket {
  const config = input.config ?? readRateLimitConfig();

  return {
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
