import type { PgPool, PostgresDatabase } from "./pg-adapter.ts";

import { createPostgresDatabase } from "./pg-adapter.ts";
import { createPostgresPool } from "./pg-pool.ts";
import { migrateDatabase } from "./schema/index.ts";

/**
 * The runtime storage handle (FID-2026-1031-085, step 4 cutover).
 *
 * Every ported module receives this handle instead of reaching for a
 * module-level singleton, so a test can hand in its own database and the
 * application can hand in the configured one. `lib/storage/runtime.ts` is the
 * only server-side caller that decides which.
 *
 * Why there is no SQLite option here: the port changed the dialect, not just
 * the driver. The store layer's original statements use `datetime()`, scalar
 * `MAX()` and `INSERT OR IGNORE`, none of which PostgreSQL accepts, and the
 * ported ledger uses `GREATEST`, `ON CONFLICT` and `::timestamptz`, none of
 * which SQLite accepts. Keeping both engines live would mean maintaining two
 * statement sets against one money path — the exact duplication that loses a
 * ledger. So the cutover is per-dialect, not per-connection, and there is one
 * dialect: PostgreSQL.
 *
 * That leaves local development needing PostgreSQL. Rather than require a
 * service, the local default is PGlite — a real PostgreSQL engine compiled to
 * WebAssembly, the same one the port's tests already run against. Same
 * dialect, same constraints, same transaction rules, no network.
 */

export type StorageMode = "postgres" | "local";

/**
 * PGlite is a development and single-process engine. It is deliberately not a
 * production fallback: a production boot with no `DATABASE_URL` must fail
 * rather than quietly serve money operations from an in-process database that
 * no second instance can see.
 */
export function resolveStorageMode(
  env: Record<string, string | undefined>,
): StorageMode {
  return env.DATABASE_URL?.trim() ? "postgres" : "local";
}

export type LocalPoolOptions = {
  /** Directory to persist in. Omitted means in-memory, which is what tests use. */
  directory?: string;
};

/**
 * A `PgPool`-shaped adapter over PGlite.
 *
 * Two protocol facts this maps rather than assumes:
 *
 * 1. PGlite's `query()` uses the extended protocol and accepts one statement.
 *    `exec()` uses the simple protocol and accepts a script. The adapter reads
 *    the caller's intent from whether values were supplied — which is exactly
 *    how `createPostgresDatabase` distinguishes the two.
 * 2. PGlite has one connection, so `connect()` returns the same engine and
 *    `release()` is a no-op. Statements are therefore serialized; a
 *    "concurrent" test against this pool proves a guard's shape, not that two
 *    clients race. `tests/settlement-concurrency.test.mjs` is the real proof
 *    and runs only against a networked database.
 */
export async function createLocalPool(
  options: LocalPoolOptions = {},
): Promise<PgPool> {
  // Dynamic import keeps the engine out of a production install: PGlite is a
  // devDependency, and a deploy with DATABASE_URL never reaches this function.
  // `serverExternalPackages` in next.config.mjs keeps Turbopack from bundling
  // it into a React Server Component, where its loader received a module URL
  // instead of a filesystem path.
  const { PGlite } = await import("@electric-sql/pglite");
  const pglite = options.directory
    ? await PGlite.create(options.directory)
    : await PGlite.create();

  const query = async (sql: string, values?: unknown[]) => {
    if (values === undefined) {
      await pglite.exec(sql);

      return { rows: [], rowCount: 0 };
    }

    const result = await pglite.query(sql, values);

    return {
      rows: result.rows,
      rowCount: result.affectedRows ?? result.rows.length,
    };
  };

  return {
    query,
    async connect() {
      return { query, release() {} };
    },
    async end() {
      await pglite.close();
    },
  };
}

export type StorageDatabaseOptions = {
  env?: Record<string, string | undefined>;
  /** Persist a local database in this directory instead of in memory. */
  localDirectory?: string;
  /** Overrides the pool entirely; the tests use this to inject PGlite. */
  pool?: PgPool;
  /** Skips connection setup for an injected pool that is already migratable. */
  poolIsInjected?: boolean;
};

/**
 * The migration runs here, not in `createPostgresDatabase`'s own `migrate`
 * callback. That callback executes while initialization is still in flight, and
 * `migrateDatabase` awaits `ready()` — awaiting it from inside would deadlock on
 * the very promise the callback is producing.
 */
export async function createStorageDatabase(
  options: StorageDatabaseOptions = {},
): Promise<PostgresDatabase> {
  const env = options.env ?? process.env;
  const mode = resolveStorageMode(env);

  const pool =
    options.pool ??
    (mode === "postgres"
      ? createPostgresPool({
          connectionString: (env.DATABASE_URL as string).trim(),
        })
      : await createLocalPool({ directory: options.localDirectory }));

  const database = createPostgresDatabase({ pool });

  if (!options.poolIsInjected) await migrateDatabase(database);

  return database;
}
