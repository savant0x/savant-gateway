import "server-only";

import type { PostgresDatabase } from "./pg-adapter.ts";

import { join } from "node:path";

import { backfillRouteElection } from "./backfill.ts";
import { createStorageDatabase, resolveStorageMode } from "./database.ts";

/**
 * The server-side storage singleton for the port (FID-2026-1031-085).
 *
 * This is the one place that decides where data lives. Everything else takes a
 * handle as an argument, which is why the ported modules are testable without a
 * running application.
 *
 * Three deliberate properties:
 *
 * 1. **Lazy and single-flight.** Importing this module opens nothing. The first
 *    request pays for the connection and the migration; concurrent first callers
 *    share one promise.
 * 2. **The result is cached even when it fails.** A rejected initialization
 *    stays rejected, so a misconfigured database fails closed on every request
 *    instead of being retried into a half-migrated schema.
 * 3. **Production refuses the local engine.** PGlite is a single connection
 *    inside one process; serving a ledger from it in production would silently
 *    diverge from any second instance. A production boot without `DATABASE_URL`
 *    raises here rather than starting.
 */

/**
 * The handle is cached on `globalThis`, not in this module's scope.
 *
 * Next compiles a React Server Component and a route handler into separate
 * module graphs. A module-level promise therefore produced two PGlite engines
 * on the same directory: the admin page's poll blocked the runner's sample
 * writes until the run appeared hung. One process must have one engine, so the
 * promise lives where every bundle can see it. In production the pool is
 * per-process either way; this only removes the duplicate inside a process.
 */
const STORAGE_KEY = "__savantStorageDatabase";
const globalStorage = globalThis as typeof globalThis & {
  [STORAGE_KEY]?: Promise<PostgresDatabase>;
};

async function create(): Promise<PostgresDatabase> {
  const mode = resolveStorageMode(process.env);

  if (process.env.NODE_ENV === "production" && mode !== "postgres") {
    throw new Error(
      "DATABASE_URL is required in production. The local storage engine is a single-process database and is not a production fallback.",
    );
  }

  const database = await createStorageDatabase({
    localDirectory:
      mode === "local"
        ? (process.env.PG_LOCAL_PATH?.trim() ??
          join(process.cwd(), "data", "pg"))
        : undefined,
  });

  // A catalog imported before the tier-scoped route groups keeps the old
  // election, which hides every paid counterpart behind `is_primary = 0`.
  // The repair is version-stamped, so this is one write on the first boot and
  // a single read afterwards (FID-2026-1102-118).
  await backfillRouteElection(database);

  return database;
}

export function getDatabase(): Promise<PostgresDatabase> {
  globalStorage[STORAGE_KEY] ??= create();

  return globalStorage[STORAGE_KEY];
}
