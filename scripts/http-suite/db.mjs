import { PGlite } from "@electric-sql/pglite";
import { createServer } from "pglite-server";
import pg from "pg";

import { renamePlaceholders } from "../../lib/storage/pg-adapter.ts";
import {
  assertDisposableEndpoint,
  startDisposablePostgres,
} from "../disposable-postgres.mjs";

/**
 * The HTTP suites' disposable database (FID-086, D-5; FID-144).
 *
 * The application is a separate process, so an in-process PGlite handle cannot
 * back it: the suite needs a real endpoint the `pg` driver can reach. By
 * default PGlite is exposed over a loopback wire server, which keeps the gate
 * on the same dialect and parser production uses without a container runtime or
 * a system PostgreSQL install. Set `HTTP_TEST_DATABASE_URL` when the run needs
 * real concurrent transactions; CI does. A caller that cannot accept PGlite's
 * single connection passes `requireReal`, which uses the supplied URL or starts
 * the pinned native cluster and fails closed when neither is available.
 *
 * The handle below is intentionally small. It offers the three calls the seed
 * and checks use (`prepare`, `query`, `exec`) and rewrites the SQLite dialect
 * that survived in those scripts: `?` placeholders, `datetime(x)` and `rowid`.
 * Anything that cannot be expressed by that rewrite (`INSERT OR REPLACE`) was
 * changed at its call site.
 */

const PUBLIC_TABLES = [
  "topups",
  "providers",
  "models",
  "model_groups",
  "users",
  "plans",
  "subscriptions",
];

function rewrite(sql) {
  return renamePlaceholders(
    sql
      .replace(/datetime\s*\(([^)]+)\)/gi, "($1)::timestamptz")
      .replace(/\browid\b/gi, "ctid"),
  );
}

/**
 * A supplied endpoint is real PostgreSQL, so transactions have real
 * concurrency semantics. Reset both schemas first: the suite seeds fixed ids
 * and must not inherit rows from an earlier gate. The endpoint is deliberately
 * named HTTP_TEST_ and may never be the application DATABASE_URL.
 */
async function resetExternalDatabase(connectionString) {
  assertDisposableEndpoint(connectionString, "HTTP_TEST_DATABASE_URL", {
    allowRemote: process.env.DISPOSABLE_REMOTE_HTTP === "yes",
  });

  const pool = new pg.Pool({ connectionString, max: 1 });

  try {
    await pool.query("DROP SCHEMA IF EXISTS content CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
  } finally {
    await pool.end();
  }
}

export async function startDatabaseServer({
  directory,
  port,
  connectionString,
  requireReal = false,
}) {
  if (connectionString) {
    await resetExternalDatabase(connectionString);
    console.log("http-suite: using HTTP_TEST_DATABASE_URL (real PostgreSQL)");

    return { connectionString, async close() {} };
  }

  if (requireReal) {
    let disposable;

    try {
      disposable = await startDisposablePostgres();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      throw new Error(
        "this suite requires real PostgreSQL; set HTTP_TEST_DATABASE_URL " +
          `(or TEST_DATABASE_URL) to a disposable endpoint, or install the ` +
          `pinned native PostgreSQL package (${detail})`,
      );
    }

    console.log(
      `http-suite: starting disposable ${disposable.image} on port ${disposable.port}`,
    );

    return {
      connectionString: disposable.connectionString,
      async close() {
        disposable.close();
      },
    };
  }

  const pglite = directory
    ? await PGlite.create(directory)
    : await PGlite.create();
  const server = createServer(pglite, { logLevel: 0 });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return {
    connectionString: `postgres://postgres@127.0.0.1:${port}/postgres`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await pglite.close();
    },
  };
}

export async function openDatabase(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 4 });

  pool.on("error", () => {
    // A client error is surfaced by the query that owned it. Logging the
    // driver's message here would print the connection string.
  });

  return {
    prepare(sql) {
      const text = rewrite(sql);

      return {
        async get(...params) {
          const result = await pool.query(text, params);

          return result.rows[0];
        },
        async all(...params) {
          const result = await pool.query(text, params);

          return result.rows;
        },
        async run(...params) {
          const result = await pool.query(text, params);

          return { changes: result.rowCount ?? 0 };
        },
      };
    },
    async query(sql, params = []) {
      const result = await pool.query(rewrite(sql), params);

      return result.rows;
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

export async function waitForSchema(database, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const rows = await database.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1)`,
        [PUBLIC_TABLES],
      );

      if (rows.length === PUBLIC_TABLES.length) return;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `schema not ready: ${lastError instanceof Error ? lastError.message : "timeout"}`,
  );
}
