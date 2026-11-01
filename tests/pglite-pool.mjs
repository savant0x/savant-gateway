import { PGlite } from "@electric-sql/pglite";

/**
 * A `PgPool`-shaped adapter over PGlite, which is a real PostgreSQL engine
 * compiled to WebAssembly. Tests therefore run the ported DDL and ledger
 * against actual PostgreSQL semantics — the parser, constraints, transaction
 * rules — instead of a fake that agrees with whatever the code does.
 *
 * Two honest limits, stated rather than hidden:
 *
 * 1. **One connection.** PGlite has a single connection, so `connect()` hands
 *    back the same engine. Statements are serialized, which means a
 *    "concurrent" test here proves the guard's shape, not that two clients race
 *    correctly. `tests/settlement-concurrency.test.mjs` is the real proof and
 *    runs only against a networked database.
 * 2. **Protocol routing.** PGlite's `query()` uses the extended protocol and
 *    accepts one statement; `exec()` uses the simple protocol and accepts a
 *    script. The adapter maps the caller's shape onto that: no `values` means a
 *    script (which is exactly how the adapter calls `exec`), and values present
 *    means one parameterised statement.
 */
export async function createPgliteDatabase() {
  const pglite = await PGlite.create();

  const query = async (sql, values) => {
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

  const pool = {
    query,
    async connect() {
      return { query, release() {} };
    },
    async end() {
      await pglite.close();
    },
  };

  return { pool, pglite };
}
