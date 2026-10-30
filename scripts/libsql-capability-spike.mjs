/**
 * FID-2026-1030-066 step 0 — libSQL capability spike.
 *
 * Proves the capabilities the storage port depends on, against a local `file:`
 * database and an in-memory one, before any call site is touched. Nothing here
 * is imported by the application; the database file is removed on exit.
 *
 * Run: node scripts/libsql-capability-spike.mjs
 *
 * Requires the client installed without saving it, because the dependency is
 * added to package.json only when the port lands (FID step 7):
 *   npm install --no-save @libsql/client
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbFile = path.join(root, "data", "spike-capability.db");
const dbUrl = `file:${path.relative(root, dbFile).replaceAll(path.sep, "/")}`;

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });

  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function check(name, run) {
  try {
    const detail = await run();

    record(name, true, detail);
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withTimeout(promise, ms, label) {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Windows holds the file briefly after close; cleanup must not fail the run. */
function removeDb() {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(`${dbFile}${suffix}`, {
        force: true,
        maxRetries: 5,
        retryDelay: 100,
        recursive: true,
      });
    } catch {
      console.log(`  (left behind: ${path.basename(dbFile)}${suffix})`);
    }
  }
}

function fresh() {
  removeDb();

  return createClient({ url: dbUrl, intMode: "number" });
}

const client = fresh();

console.log(`libSQL client ${readVersion()} · ${dbUrl}\n`);

await check("file: client connects", async () => {
  const rs = await client.execute("SELECT 1 AS one");

  assert(rs.rows[0].one === 1, "SELECT 1 returned the wrong value");

  return "SELECT 1";
});

await check("interactive write transaction commits", async () => {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS money (id TEXT PRIMARY KEY, micros INTEGER NOT NULL)",
  );

  const tx = await client.transaction("write");

  try {
    await tx.execute({
      sql: "INSERT INTO money (id, micros) VALUES (?, ?)",
      args: ["a", 1_500_000],
    });
    await tx.commit();
  } finally {
    tx.close();
  }

  const row = await client.execute("SELECT micros FROM money WHERE id = 'a'");

  assert(row.rows[0].micros === 1_500_000, "committed row missing");

  return "BEGIN IMMEDIATE → commit";
});

await check("transaction rolls back on throw", async () => {
  const tx = await client.transaction("write");

  try {
    await tx.execute({
      sql: "INSERT INTO money (id, micros) VALUES (?, ?)",
      args: ["rollback", 99],
    });
    await tx.rollback();
  } finally {
    tx.close();
  }

  const row = await client.execute(
    "SELECT COUNT(*) AS n FROM money WHERE id = 'rollback'",
  );

  assert(row.rows[0].n === 0, "rolled-back row persisted");

  return "rollback discarded the write";
});

await check("savepoint nesting with partial rollback", async () => {
  const tx = await client.transaction("write");

  try {
    await tx.execute({
      sql: "INSERT INTO money (id, micros) VALUES (?, ?)",
      args: ["outer", 10],
    });
    await tx.execute("SAVEPOINT sg_inner");
    await tx.execute({
      sql: "INSERT INTO money (id, micros) VALUES (?, ?)",
      args: ["inner", 20],
    });
    await tx.execute("ROLLBACK TO sg_inner");
    await tx.execute("RELEASE sg_inner");
    await tx.commit();
  } finally {
    tx.close();
  }

  const rows = await client.execute(
    "SELECT id FROM money WHERE id IN ('outer', 'inner') ORDER BY id",
  );
  const ids = rows.rows.map((row) => row.id);

  assert(
    ids.length === 1 && ids[0] === "outer",
    `expected only the outer row, got ${JSON.stringify(ids)}`,
  );

  return "inner savepoint rolled back, outer kept";
});

await check("executeMultiple inside a transaction", async () => {
  const tx = await client.transaction("write");

  try {
    await tx.executeMultiple(`
      CREATE TABLE IF NOT EXISTS multi (id TEXT PRIMARY KEY, n INTEGER NOT NULL);
      INSERT INTO multi (id, n) VALUES ('x', 1);
      INSERT INTO multi (id, n) VALUES ('y', 2);
    `);
    await tx.commit();
  } finally {
    tx.close();
  }

  const rows = await client.execute("SELECT COUNT(*) AS n FROM multi");

  assert(rows.rows[0].n === 2, "multi-statement script did not apply");

  return "3 statements, atomic";
});

await check("executeMultiple is available on the client and not transactional", async () => {
  assert(typeof client.executeMultiple === "function", "client.executeMultiple missing");

  return "present on client and transaction";
});

await check("PRAGMA table_info returns column rows", async () => {
  const rs = await client.execute("PRAGMA table_info(money)");
  const names = rs.rows.map((row) => row.name);

  assert(names.includes("id") && names.includes("micros"), `got ${names.join(",")}`);

  return names.join(",");
});

await check("PRAGMA foreign_keys accepted and cascades fire", async () => {
  await client.execute("PRAGMA foreign_keys = ON");

  const state = await client.execute("PRAGMA foreign_keys");

  await client.execute(
    "CREATE TABLE IF NOT EXISTS parent (id TEXT PRIMARY KEY, micros INTEGER NOT NULL)",
  );
  await client.execute(
    `CREATE TABLE IF NOT EXISTS child (
       id TEXT PRIMARY KEY,
       parent_id TEXT NOT NULL REFERENCES parent(id) ON DELETE CASCADE
     )`,
  );
  await client.execute("DELETE FROM child");
  await client.execute("DELETE FROM parent");
  await client.execute({
    sql: "INSERT INTO parent (id, micros) VALUES (?, ?)",
    args: ["p1", 0],
  });
  await client.execute({
    sql: "INSERT INTO child (id, parent_id) VALUES (?, ?)",
    args: ["c1", "p1"],
  });
  await client.execute({ sql: "DELETE FROM parent WHERE id = ?", args: ["p1"] });

  const children = await client.execute("SELECT COUNT(*) AS n FROM child");

  assert(children.rows[0].n === 0, "CASCADE did not delete the child row");

  return `foreign_keys=${JSON.stringify(state.rows[0])}`;
});

await check("unsupported pragmas on a remote target would throw (local accepts)", async () => {
  const journal = await client.execute("PRAGMA journal_mode = WAL");

  await client.execute("PRAGMA busy_timeout = 5000");
  await client.execute("PRAGMA synchronous = NORMAL");

  return `journal_mode=${String(journal.rows[0]?.journal_mode)}`;
});

await check("datetime() ordering", async () => {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS stamped (id TEXT PRIMARY KEY, created_at TEXT NOT NULL)",
  );
  await client.execute("DELETE FROM stamped");

  for (const [id, at] of [
    ["early", "2026-10-30T09:00:00.000Z"],
    ["late", "2026-10-30T17:00:00.000Z"],
    ["mid", "2026-10-30T12:00:00.000Z"],
  ]) {
    await client.execute({
      sql: "INSERT INTO stamped (id, created_at) VALUES (?, ?)",
      args: [id, at],
    });
  }

  const rows = await client.execute(
    "SELECT id FROM stamped ORDER BY datetime(created_at) DESC",
  );
  const order = rows.rows.map((row) => row.id);

  assert(order.join(",") === "late,mid,early", `order was ${order.join(",")}`);

  return order.join(" > ");
});

await check("integer fidelity for micro amounts", async () => {
  const values = [1, 1_500_000, 4_000_000_000_000, Number.MAX_SAFE_INTEGER];

  await client.execute(
    "CREATE TABLE IF NOT EXISTS fidelity (id TEXT PRIMARY KEY, micros INTEGER NOT NULL)",
  );

  const tx = await client.transaction("write");

  try {
    await tx.execute("DELETE FROM fidelity");

    for (const value of values) {
      await tx.execute({
        sql: "INSERT INTO fidelity (id, micros) VALUES (?, ?)",
        args: [`v${value}`, value],
      });
    }

    await tx.commit();
  } finally {
    tx.close();
  }

  const rows = await client.execute("SELECT id, micros FROM fidelity");

  for (const row of rows.rows) {
    const expected = Number(String(row.id).slice(1));

    assert(row.micros === expected, `${row.id} read back as ${row.micros}`);
  }

  return `${values.length} values exact, typeof=${typeof rows.rows[0].micros}`;
});

await check("result shape: rows by name, rowsAffected, lastInsertRowid", async () => {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS auto (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT)",
  );

  const insert = await client.execute({
    sql: "INSERT INTO auto (label) VALUES (?)",
    args: ["one"],
  });
  const select = await client.execute("SELECT id, label FROM auto LIMIT 1");

  assert(select.rows[0].label === "one", "row not addressable by column name");
  assert(insert.rowsAffected === 1, `rowsAffected was ${insert.rowsAffected}`);

  return `rowsAffected=${insert.rowsAffected} lastInsertRowid=${String(insert.lastInsertRowid)} (${typeof insert.lastInsertRowid}) columns=${select.columns.join(",")}`;
});

await check("nested transaction on one client is rejected, not blocked", async () => {
  const outer = await client.transaction("write");

  try {
    const outcome = await withTimeout(
      client.transaction("write").then(
        async (inner) => {
          inner.close();

          return "started";
        },
        (error) => `rejected: ${error instanceof Error ? error.message : String(error)}`,
      ),
      3000,
      "nested transaction",
    );

    assert(
      outcome !== "started",
      "a nested write transaction succeeded; nested callers would need no savepoints",
    );

    return outcome;
  } finally {
    await outer.rollback();
    outer.close();
  }
});

await check("in-memory client supports the same API", async () => {
  const memory = createClient({ url: ":memory:", intMode: "number" });
  const tx = await memory.transaction("write");

  try {
    await tx.execute("CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)");
    await tx.execute({ sql: "INSERT INTO t (id, n) VALUES (?, ?)", args: ["a", 7] });
    await tx.commit();
  } finally {
    tx.close();
  }

  const row = await memory.execute("SELECT n FROM t WHERE id = 'a'");

  memory.close();

  assert(row.rows[0].n === 7, ":memory: round trip failed");

  return "transaction over :memory:";
});

client.close();

await new Promise((resolve) => setTimeout(resolve, 150));
removeDb();

const failed = results.filter((result) => !result.ok);

console.log(
  `\nspike: ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length} checks)`,
);

if (failed.length > 0) process.exitCode = 1;

function readVersion() {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(root, "node_modules", "@libsql", "client", "package.json"),
        "utf8",
      ),
    ).version;
  } catch {
    return "(version unknown)";
  }
}
