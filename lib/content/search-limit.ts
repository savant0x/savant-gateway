/**
 * Public search rate limit (FID-2026-1103-123).
 *
 * Search is an unauthenticated navigation aid, so the ceiling has to be cheap
 * and bounded. A token bucket allows a short burst and a steady refill; the
 * key map is capped and idle keys are dropped so distinct clients cannot grow
 * process memory without limit.
 */

import { clientKey } from "../customer-rate-limit.ts";
import {
  retryAfterSeconds,
  takeToken,
  type BucketState,
} from "../token-bucket.ts";

export const SEARCH_RATE_LIMIT = {
  capacity: 15,
  refillPerMinute: 30,
  maxClients: 5_000,
  idleEvictMs: 10 * 60 * 1000,
} as const;

type Entry = { state: BucketState; seenAt: number };

const buckets = new Map<string, Entry>();

export type SearchLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * One identity policy for every public limiter: only a configured, trusted
 * ingress header is read. A blank setting shares one client bucket, matching
 * `GATEWAY_TRUSTED_IP_HEADER` in `.env.example`; a spoofable header must not
 * mint a fresh search bucket.
 */
export function searchClientKey(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): string {
  return clientKey(request, env);
}

/** Runs only when the map is full, so a normal request never scans it. */
function makeRoom(now: number) {
  for (const [key, entry] of Array.from(buckets)) {
    if (now - entry.seenAt >= SEARCH_RATE_LIMIT.idleEvictMs) {
      buckets.delete(key);
    }
  }

  while (buckets.size >= SEARCH_RATE_LIMIT.maxClients) {
    const oldest = buckets.keys().next().value;

    if (oldest === undefined) return;

    buckets.delete(oldest);
  }
}

export function takeSearchToken(
  key: string,
  now = Date.now(),
): SearchLimitDecision {
  if (!buckets.has(key)) makeRoom(now);

  const entry = buckets.get(key);
  const decision = takeToken(entry?.state, now, {
    capacity: SEARCH_RATE_LIMIT.capacity,
    refillPerMinute: SEARCH_RATE_LIMIT.refillPerMinute,
  });

  // Re-inserting keeps Map order aligned with recency for the eviction sweep.
  buckets.delete(key);
  buckets.set(key, { state: decision.state, seenAt: now });

  return {
    allowed: decision.allowed,
    remaining: decision.remaining,
    retryAfterSeconds: retryAfterSeconds(decision.retryAfterMs),
  };
}

/** Test hook: a fresh process starts with an empty limiter anyway. */
export function resetSearchRateLimit() {
  buckets.clear();
}
