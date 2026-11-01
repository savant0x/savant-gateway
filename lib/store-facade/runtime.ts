import type { PostgresDatabase } from "../storage/pg-adapter.ts";

/**
 * The database resolver behind the async store façade (FID-086, step 4).
 *
 * The façade wraps every ported store function so callers keep their existing
 * names and only gain `await`. The one thing a wrapper must not do is import
 * `lib/storage/runtime.ts` directly: that module imports `server-only`, and a
 * façade that cannot be loaded outside a React server is a façade the tests
 * cannot check. So the resolver is injected — `lib/store.ts` binds the real
 * runtime once, and the tests bind their own PGlite handle.
 *
 * Failing closed is deliberate: an unbound façade throws instead of returning
 * undefined, so a mis-wired entry point fails on its first call rather than
 * serving a page with silently missing data.
 */

let resolver: (() => Promise<PostgresDatabase>) | null = null;

export function bindStoreRuntime(resolve: () => Promise<PostgresDatabase>) {
  resolver = resolve;
}

/**
 * Resolves the handle, binding the server runtime on first use.
 *
 * The fallback exists because a route can import one façade group without ever
 * importing the barrel that binds: `/api/ready` did exactly that, and the
 * failure surfaced as an admitted-looking `unavailable` rather than a crash.
 * Importing the resolver dynamically keeps `server-only` out of this module's
 * import graph, so the tests can still load it and bind their own handle — an
 * explicit `bindStoreRuntime` call always wins because it sets `resolver` first.
 */
export async function storeRuntime(): Promise<PostgresDatabase> {
  if (!resolver) {
    const { getDatabase } = await import("../storage/runtime.ts");

    resolver = getDatabase;
  }

  return resolver();
}
