/**
 * A negligible, dependency-free TTL memo for read-only projection data. It is
 * not a data store: callers must be able to serve a value that is up to
 * `ttlMs` stale, and every caller keeps its own cache instance.
 */
export type TtlCache<T> = {
  get(): T | null;
  set(value: T): void;
  clear(): void;
};

export function createTtlCache<T>(
  ttlMs: number,
  now: () => number = Date.now,
): TtlCache<T> {
  const ttl = Math.max(0, Math.floor(ttlMs));
  let value: T | null = null;
  let expiresAt = 0;

  return {
    get() {
      if (value === null) return null;
      if (now() >= expiresAt) {
        value = null;
        expiresAt = 0;

        return null;
      }

      return value;
    },
    set(next: T) {
      value = next;
      expiresAt = now() + ttl;
    },
    clear() {
      value = null;
      expiresAt = 0;
    },
  };
}
