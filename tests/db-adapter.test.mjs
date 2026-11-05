import assert from "node:assert/strict";
import test from "node:test";

import {
  createPostgresDatabase,
  renamePlaceholders,
} from "../lib/storage/pg-adapter.ts";
import { buildPoolOptions } from "../lib/storage/pg-pool.ts";

const EMPTY = { rows: [], rowCount: 0 };

/**
 * Injectable stand-in for `pg.Pool`. It records every statement and every
 * leased client so the adapter's own behaviour — transaction routing, savepoint
 * nesting, release, initialization — is asserted without a database.
 *
 * What this file cannot prove is isolation: that two settlements against one
 * balance commit exactly once is the FID-085 step 0 / step 3 proof against a
 * real server, not something a fake can answer.
 */
function createFakePool(respond = () => EMPTY) {
  const poolQueries = [];
  const leases = [];

  const pool = {
    async query(sql, values) {
      poolQueries.push({ sql, values });

      return respond({ sql, values, lease: null });
    },
    async connect() {
      const lease = { queries: [], released: false, releaseError: undefined };

      leases.push(lease);

      return {
        async query(sql, values) {
          lease.queries.push({ sql, values });

          return respond({ sql, values, lease });
        },
        release(error) {
          lease.released = true;
          lease.releaseError = error;
        },
      };
    },
    async end() {},
  };

  return { pool, poolQueries, leases };
}

function statements(lease) {
  return lease.queries.map((entry) => entry.sql);
}

test("placeholders are renumbered to positional parameters", () => {
  assert.equal(renamePlaceholders("SELECT ?, ?"), "SELECT $1, $2");
  assert.equal(renamePlaceholders("SELECT 1"), "SELECT 1");
});

test("question marks in literals, identifiers, comments and dollar quotes are kept", () => {
  const sql =
    "SELECT '?', \"?\", ? -- ?\nFROM t WHERE a = '?it''s?' /* ? */ AND b = $tag$ ? $tag$ AND c = ?";

  assert.equal(
    renamePlaceholders(sql),
    "SELECT '?', \"?\", $1 -- ?\nFROM t WHERE a = '?it''s?' /* ? */ AND b = $tag$ ? $tag$ AND c = $2",
  );
});

test("get returns the first row and undefined when the result is empty", async () => {
  const { pool, poolQueries } = createFakePool(({ sql }) =>
    sql.includes("hits") ? { rows: [{ id: "a" }], rowCount: 1 } : EMPTY,
  );
  const db = createPostgresDatabase({ pool });

  assert.deepEqual(await db.prepare("SELECT ? AS hits").get("x"), { id: "a" });
  assert.equal(await db.prepare("SELECT ? AS misses").get("y"), undefined);
  assert.deepEqual(poolQueries.at(-1).values, ["y"]);

  await db.close();
});

test("all returns every row and an empty array for no rows", async () => {
  const { pool } = createFakePool(() => ({
    rows: [{ id: 1 }, { id: 2 }],
    rowCount: 2,
  }));
  const db = createPostgresDatabase({ pool });

  assert.deepEqual(await db.prepare("SELECT ? AS id").all(1), [
    { id: 1 },
    { id: 2 },
  ]);

  const empty = createPostgresDatabase({ pool: createFakePool().pool });

  assert.deepEqual(await empty.prepare("SELECT ?").all(1), []);
});

test("run reports affected rows and falls back to zero", async () => {
  const counted = createPostgresDatabase({
    pool: createFakePool(() => ({ rows: [], rowCount: 3 })).pool,
  });

  assert.deepEqual(await counted.prepare("UPDATE t SET a = ?").run(1), {
    changes: 3,
  });

  const uncounted = createPostgresDatabase({
    pool: createFakePool(() => ({ rows: [], rowCount: null })).pool,
  });

  assert.deepEqual(await uncounted.prepare("UPDATE t SET a = ?").run(1), {
    changes: 0,
  });
});

test("exec sends a multi-statement script with no parameters", async () => {
  const { pool, poolQueries } = createFakePool();
  const db = createPostgresDatabase({ pool });

  await db.exec("CREATE TABLE a (id int); CREATE TABLE b (id int);");

  const script = poolQueries.find((entry) => entry.sql.startsWith("CREATE"));

  assert.equal(script.values, undefined);
});

test("a transaction runs on one leased client and commits there", async () => {
  const { pool, poolQueries, leases } = createFakePool();
  const db = createPostgresDatabase({ pool });

  const result = await db.transaction(async () => {
    await db.prepare("UPDATE credit SET balance = ?").run(1);

    return "ok";
  })();

  assert.equal(result, "ok");
  assert.equal(leases.length, 1);
  assert.deepEqual(statements(leases[0]), [
    "BEGIN",
    "UPDATE credit SET balance = $1",
    "COMMIT",
  ]);
  assert.equal(leases[0].released, true, "the lease is always released");
  assert.equal(
    poolQueries.some((entry) => entry.sql.startsWith("UPDATE")),
    false,
    "no transaction statement escapes to the pool",
  );
});

test("immediate keeps the write-transaction call shape", async () => {
  const { pool, leases } = createFakePool();
  const db = createPostgresDatabase({ pool });

  await db.transaction(async () => {
    await db.prepare("UPDATE t SET a = ?").run(1);
  }).immediate();

  assert.deepEqual(statements(leases[0]), ["BEGIN", "UPDATE t SET a = $1", "COMMIT"]);
});

test("a throwing transaction rolls back and still releases", async () => {
  const { pool, leases } = createFakePool();
  const db = createPostgresDatabase({ pool });

  await assert.rejects(
    async () =>
      db.transaction(async () => {
        throw new Error("boom");
      })(),
    /boom/,
  );

  assert.deepEqual(statements(leases[0]), ["BEGIN", "ROLLBACK"]);
  assert.equal(leases[0].released, true);
  assert.equal(leases[0].releaseError, undefined);
});

test("a failed rollback discards the client with the rollback error", async () => {
  const { pool, leases } = createFakePool(({ sql }) => {
    if (sql === "ROLLBACK") throw new Error("connection lost");

    return EMPTY;
  });
  const db = createPostgresDatabase({ pool });

  await assert.rejects(
    async () =>
      db.transaction(async () => {
        throw new Error("boom");
      })(),
    /boom/,
    "the original statement error is preserved",
  );

  assert.deepEqual(statements(leases[0]), ["BEGIN", "ROLLBACK"]);
  assert.equal(leases[0].released, true);
  assert.equal(leases[0].releaseError?.message, "connection lost");
});

test("a nested transaction uses a savepoint and releases it", async () => {
  const { pool, leases } = createFakePool();
  const db = createPostgresDatabase({ pool });

  await db.transaction(async () => {
    await db.transaction(async () => {
      await db.prepare("SELECT ?").all(1);
    })();
  })();

  assert.deepEqual(statements(leases[0]), [
    "BEGIN",
    "SAVEPOINT gateway_sp_1",
    "SELECT $1",
    "RELEASE SAVEPOINT gateway_sp_1",
    "COMMIT",
  ]);
});

test("a failed nested transaction rolls back to its savepoint only", async () => {
  const { pool, leases } = createFakePool();
  const db = createPostgresDatabase({ pool });

  await db.transaction(async () => {
    await assert.rejects(async () =>
      db.transaction(async () => {
        throw new Error("inner");
      })(),
    );
  })();

  assert.deepEqual(statements(leases[0]), [
    "BEGIN",
    "SAVEPOINT gateway_sp_1",
    "ROLLBACK TO SAVEPOINT gateway_sp_1",
    "COMMIT",
  ]);
});

test("concurrent transactions lease separate clients", async () => {
  const { pool, leases } = createFakePool();
  const db = createPostgresDatabase({ pool });

  await Promise.all([
    db.transaction(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await db.prepare("SELECT ?").all(1);
    })(),
    db.transaction(async () => {
      await db.prepare("SELECT ?").all(2);
    })(),
  ]);

  assert.equal(leases.length, 2);
  assert.deepEqual(
    leases.map((lease) => lease.queries[1].values[0]).sort(),
    [1, 2],
  );
});

test("initialization is lazy and single-flight", async () => {
  const { pool, poolQueries } = createFakePool();
  let migrations = 0;
  const db = createPostgresDatabase({
    pool,
    migrate: async (client) => {
      migrations += 1;
      await client.exec("CREATE TABLE probe (id int)");
    },
  });

  assert.equal(poolQueries.length, 0, "creating the handle touches no database");

  await Promise.all([
    db.prepare("SELECT ?").all(1),
    db.prepare("SELECT ?").all(2),
  ]);

  assert.equal(migrations, 1);
  assert.equal(poolQueries.filter((entry) => entry.sql === "SELECT 1").length, 1);
  assert.equal(
    poolQueries.filter((entry) => entry.sql.startsWith("CREATE TABLE")).length,
    1,
  );
});

test("a failed initialization fails closed for every later call", async () => {
  const { pool, poolQueries } = createFakePool();
  const db = createPostgresDatabase({
    pool,
    migrate: async () => {
      throw new Error("migration failed");
    },
  });

  await assert.rejects(async () => db.prepare("SELECT ?").all(1), /migration failed/);
  await assert.rejects(async () => db.prepare("SELECT ?").all(1), /migration failed/);
  assert.equal(
    poolQueries.filter((entry) => entry.sql === "SELECT 1").length,
    1,
    "the failed run is not retried into a half-migrated schema",
  );
});

test("pool options apply the acquisition budget and session timeouts", async () => {
  const queries = [];
  const options = buildPoolOptions({
    connectionString: "postgres://example.test/gateway",
    maxConnections: 4,
    connectionTimeoutMs: 1_500,
    statementTimeoutMs: 12_000,
    idleInTransactionTimeoutMs: 45_000,
  });

  assert.equal(options.connectionString, "postgres://example.test/gateway");
  assert.equal(options.max, 4);
  assert.equal(options.connectionTimeoutMillis, 1_500);
  assert.equal(options.application_name, "savant-gateway");
  assert.equal(
    buildPoolOptions({ connectionString: "postgres://example.test/gateway" })
      .connectionTimeoutMillis,
    5_000,
    "the default acquisition budget is finite and below the route deadline",
  );
  assert.equal(
    "options" in options,
    false,
    "a startup options packet is rejected by Neon's pooled endpoint",
  );

  await options.onConnect({
    async query(sql) {
      queries.push(sql);

      return EMPTY;
    },
  });

  assert.deepEqual(queries, [
    "SET statement_timeout = 12000; SET idle_in_transaction_session_timeout = 45000",
  ]);
});
