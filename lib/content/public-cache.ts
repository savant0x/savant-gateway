/**
 * Public Signal read memo (FID-2026-1103-123).
 *
 * Next's segment `revalidate` prerenders a page at build time, and this
 * repository builds without a database, so an ISR page cannot be introduced
 * without breaking `npm run build`. The pages therefore stay dynamic, and the
 * repeated read is memoized here for a minute instead. That removes the
 * per-request Postgres query the caching work was meant to remove without
 * pretending a page can be rendered from a database the build does not have.
 *
 * The map is FIFO-bounded: arbitrary topic, search and digest-day inputs cannot
 * grow process memory without limit. A hit is shared by every visitor, so only
 * session-free public projections may use it.
 */

import { createTtlCache } from "../cache.ts";

export const PUBLIC_READ_TTL_MS = 60_000;
export const PUBLIC_READ_MAX_KEYS = 200;

type Entry = {
  cache: ReturnType<typeof createTtlCache<unknown>>;
  pending: Promise<unknown> | null;
};

const entries = new Map<string, Entry>();

function entryFor(key: string): Entry {
  const existing = entries.get(key);

  if (existing) return existing;

  while (entries.size >= PUBLIC_READ_MAX_KEYS) {
    const oldest = entries.keys().next().value;

    if (oldest === undefined) break;

    entries.delete(oldest);
  }

  const created: Entry = {
    cache: createTtlCache<unknown>(PUBLIC_READ_TTL_MS),
    pending: null,
  };

  entries.set(key, created);

  return created;
}

export async function cachedPublicRead<T>(
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const entry = entryFor(key);
  const cached = entry.cache.get();

  if (cached !== null) return cached as T;

  // Concurrent misses share one query rather than stampeding Postgres.
  if (!entry.pending) {
    entry.pending = load()
      .then((value) => {
        entry.cache.set(value);

        return value;
      })
      .finally(() => {
        entry.pending = null;
      });
  }

  return (await entry.pending) as T;
}

/** Test hook; a fresh process starts empty. */
export function resetPublicReadCache() {
  entries.clear();
}
