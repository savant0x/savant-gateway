/**
 * Completion rate limiting at the gateway boundary.
 *
 * The upstream free plan permits 15 requests per minute for the whole account,
 * shared by every customer. Nothing stopped one free key from spending all of
 * it, so free traffic now draws from a single bucket that sits below that
 * ceiling, while each paid key gets its own bucket: paying customers are not
 * slowed down by anonymous bursts.
 *
 * State is per process. The gateway runs as one Node process against local
 * SQLite, which is the deployment this protects; a multi-instance deployment
 * would need the same buckets in shared storage.
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

export type RateLimitDecision = {
  allowed: boolean;
  scope: "free" | "paid";
  /** Sustained requests per minute for this scope. */
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
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

const buckets = new Map<string, BucketState>();

function bucketConfig(rpm: number): BucketConfig {
  // A full minute of allowance may arrive at once; it refills over the minute.
  return { capacity: rpm, refillPerMinute: rpm };
}

export function checkCompletionRate(input: {
  keyId: string;
  free: boolean;
  now?: number;
  config?: RateLimitConfig;
}): RateLimitDecision {
  const config = input.config ?? readRateLimitConfig();
  const now = input.now ?? Date.now();
  const scope = input.free ? "free" : "paid";
  const rpm = input.free ? config.freeSharedRpm : config.paidKeyRpm;
  const name = input.free
    ? "completion:free"
    : `completion:paid:${input.keyId}`;
  const decision = takeToken(buckets.get(name), now, bucketConfig(rpm));

  buckets.set(name, decision.state);

  return {
    allowed: decision.allowed,
    scope,
    limit: rpm,
    remaining: decision.remaining,
    retryAfterSeconds: retryAfterSeconds(decision.retryAfterMs),
  };
}

/** Test and maintenance hook: forget every bucket. */
export function resetCompletionRateLimits() {
  buckets.clear();
}
