import { PGlite } from "@electric-sql/pglite";
import { createServer } from "pglite-server";
import pg from "pg";

import { renamePlaceholders } from "../../lib/storage/pg-adapter.ts";

/**
 * A disposable PostgreSQL wire server for the HTTP suites (FID-086, D-5).
 *
 * The application is a separate process, so an in-process PGlite handle cannot
 * back it: the suite needs a real endpoint the `pg` driver can reach. PGlite is
 * still the engine — the wire server only exposes it over loopback — which keeps
 * the gate on the same dialect and parser production uses without requiring a
 * Docker daemon or a system PostgreSQL install.
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

export async function startDatabaseServer({ directory, port }) {
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
