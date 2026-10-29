type Window = {
  failures: number;
  resetAt: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function createRateLimiter(options?: {
  limit?: number;
  windowMs?: number;
}) {
  const limit = options?.limit ?? 5;
  const windowMs = options?.windowMs ?? 10 * 60 * 1000;
  const windows = new Map<string, Window>();

  function current(key: string, now: number) {
    const entry = windows.get(key);

    if (entry && now >= entry.resetAt) {
      windows.delete(key);

      return undefined;
    }

    return entry;
  }

  return {
    check(key: string, now = Date.now()): RateLimitDecision {
      const entry = current(key, now);

      if (!entry) return { allowed: true, retryAfterSeconds: 0 };

      if (entry.failures < limit) {
        return { allowed: true, retryAfterSeconds: 0 };
      }

      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    },
    fail(key: string, now = Date.now()) {
      const entry = current(key, now);

      if (!entry) {
        windows.set(key, { failures: 1, resetAt: now + windowMs });

        return;
      }

      entry.failures += 1;
    },
    reset(key: string) {
      windows.delete(key);
    },
  };
}
