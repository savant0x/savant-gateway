/**
 * Token bucket, pure and clock-injected.
 *
 * A bucket holds at most `capacity` tokens and refills at `refillPerMinute`.
 * One admitted request costs one token, so `capacity` is also the largest burst
 * tolerated and `refillPerMinute` is the sustained rate. Callers own the state,
 * which keeps the arithmetic testable and free of timers.
 */
export type BucketConfig = {
  capacity: number;
  refillPerMinute: number;
};

export type BucketState = {
  tokens: number;
  updatedAt: number;
};

export type BucketDecision = {
  allowed: boolean;
  state: BucketState;
  /** Whole tokens left after this decision, for a rate-limit header. */
  remaining: number;
  /** Milliseconds until one token exists; 0 when the request was admitted. */
  retryAfterMs: number;
};

export function freshBucket(config: BucketConfig, now: number): BucketState {
  return { tokens: Math.max(1, config.capacity), updatedAt: now };
}

/**
 * Applies one request against the bucket. A clock that moves backwards refills
 * nothing and rebases the timestamp, so a corrected clock cannot mint tokens.
 */
export function takeToken(
  state: BucketState | undefined,
  now: number,
  config: BucketConfig,
): BucketDecision {
  const capacity = Math.max(1, Math.floor(config.capacity));
  const refillPerMinute = Math.max(0.001, config.refillPerMinute);
  const current = state ?? freshBucket({ capacity, refillPerMinute }, now);
  const elapsedMs = Math.max(0, now - current.updatedAt);
  const refilled = Math.min(
    capacity,
    current.tokens + (elapsedMs * refillPerMinute) / 60_000,
  );

  if (refilled >= 1) {
    return {
      allowed: true,
      state: { tokens: refilled - 1, updatedAt: now },
      remaining: Math.floor(refilled - 1),
      retryAfterMs: 0,
    };
  }

  const missing = 1 - refilled;

  return {
    allowed: false,
    state: { tokens: refilled, updatedAt: now },
    remaining: 0,
    retryAfterMs: Math.ceil((missing * 60_000) / refillPerMinute),
  };
}

/** Seconds a caller must wait, never below one, for a Retry-After header. */
export function retryAfterSeconds(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 1_000));
}
