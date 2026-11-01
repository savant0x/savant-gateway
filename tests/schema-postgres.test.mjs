import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createPostgresDatabase } from "../lib/storage/pg-adapter.ts";
import { ensureColumn } from "../lib/storage/schema/columns.ts";
import { migrateDatabase } from "../lib/storage/schema/index.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function createFakePool(respond = () => ({ rows: [], rowCount: 0 })) {
  const poolQueries = [];
  const leases = [];

  const pool = {
    async query(sql, values) {
      poolQueries.push({ sql, values });

      return respond({ sql, values });
    },
    async connect() {
      const lease = { queries: [], released: false };

      leases.push(lease);

      return {
        async query(sql, values) {
          lease.queries.push({ sql, values });

          return respond({ sql, values });
        },
        release() {
          lease.released = true;
        },
      };
    },
    async end() {},
  };

  return { pool, poolQueries, leases };
}

/** Every statement the migration issued, in order, across pool and leases. */
function allStatements(fixture) {
  return [
    ...fixture.poolQueries.map((entry) => entry.sql),
    ...fixture.leases.flatMap((lease) => lease.queries.map((entry) => entry.sql)),
  ];
}

function createdTables(statements) {
  const names = new Set();

  for (const sql of statements) {
    for (const match of sql.matchAll(
      /CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_.]*)/gi,
    )) {
      names.add(match[1]);
    }
  }

  return [...names].sort();
}

/** Table names declared by the ported schema modules. */
function declaredTables() {
  const directory = join(ROOT, "lib", "storage", "schema");
  const names = new Set();

  for (const name of readdirSync(directory).filter((file) =>
    file.endsWith(".ts"),
  )) {
    for (const match of readFileSync(join(directory, name), "utf8").matchAll(
      /CREATE TABLE IF NOT EXISTS\s+([a-z_.]+)/gi,
    )) {
      names.add(match[1]);
    }
  }

  return [...names].sort();
}

async function migrate(respond) {
  const fixture = createFakePool(respond);
  const db = createPostgresDatabase({ pool: fixture.pool });

  await migrateDatabase(db);

  return { ...fixture, db };
}

test("the Postgres schema creates every table its modules declare", async () => {
  const { poolQueries, leases } = await migrate();
  const tables = createdTables(allStatements({ poolQueries, leases }));
  // The identity namespace (FID-087) is Postgres-only by design: it has no
  // SQLite counterpart and no foreign keys into the billing tables. Compare
  // the public tables, then assert the isolated namespace explicitly so a
  // dropped identity table still fails this gate.
  const publicTables = tables.filter((name) => !name.includes("."));
  const identityTables = tables.filter((name) => name.startsWith("identity."));
  const expected = declaredTables().filter((name) => !name.includes("."));

  assert.ok(expected.length >= 40, `expected at least 40 tables, saw ${expected.length}`);
  assert.deepEqual(
    publicTables,
    expected,
    "a table was added to one schema and not the other — this gate exists to catch exactly that",
  );
  assert.deepEqual(identityTables, [
    "identity.corrections",
    "identity.findings",
    "identity.protocols",
    "identity.references",
    "identity.runs",
    "identity.samples",
    "identity.verdicts",
  ]);
});

test("the generated DDL contains no SQLite-only syntax", async () => {
  const { poolQueries, leases } = await migrate();
  const sql = allStatements({ poolQueries, leases }).join("\n");

  for (const forbidden of [
    /INSERT OR IGNORE/i,
    /INSERT OR REPLACE/i,
    /PRAGMA/i,
    /AUTOINCREMENT/i,
    /\bdatetime\s*\(/i,
    /\bstrftime\s*\(/i,
    /\bjulianday\s*\(/i,
    /COLLATE NOCASE/i,
    /INTEGER PRIMARY KEY/i,
    /\bREAL\b/,
  ]) {
    assert.doesNotMatch(sql, forbidden, `generated DDL still contains ${forbidden}`);
  }
});

test("money and token columns are BIGINT, not int4", async () => {
  const { poolQueries, leases } = await migrate();
  const sql = allStatements({ poolQueries, leases }).join("\n");

  for (const column of [
    "credit_micros",
    "hold_micros",
    "amount_micros",
    "balance_after_micros",
    "estimated_micros",
    "weighted_tokens",
    "included_weighted_tokens",
  ]) {
    assert.match(
      sql,
      new RegExp(`${column} BIGINT`, "i"),
      `${column} must be BIGINT so a 64-bit micro amount is not narrowed`,
    );
  }
});

test("the migration runs inside one transaction on one lease", async () => {
  const { leases, poolQueries } = await migrate();

  assert.equal(leases.length, 1);
  const statements = leases[0].queries.map((entry) => entry.sql);

  assert.equal(statements[0], "BEGIN");
  assert.equal(statements.at(-1), "COMMIT");
  assert.equal(
    poolQueries.filter((entry) => entry.sql !== "SELECT 1").length,
    0,
    "no migration statement escapes the transaction's client",
  );
  assert.equal(leases[0].released, true);
});

test("a second run issues the same statements, so the migration is idempotent", async () => {
  const first = await migrate();
  const second = await migrate();

  assert.deepEqual(
    allStatements(second).filter((sql) => sql !== "SELECT 1"),
    allStatements(first).filter((sql) => sql !== "SELECT 1"),
    "the migration must be re-runnable on every boot",
  );
});

test("providers and system groups are seeded once with ON CONFLICT DO NOTHING", async () => {
  const { leases } = await migrate();
  const statements = leases[0].queries;

  for (const slug of ["savant", "commandcode", "apixo"]) {
    const seeds = statements.filter(
      (entry) =>
        entry.sql.includes("INSERT INTO providers") &&
        entry.sql.includes(`'${slug}'`),
    );

    assert.equal(seeds.length, 1, `${slug} must be seeded exactly once`);
  }

  const groups = statements.filter((entry) =>
    entry.sql.includes("INSERT INTO model_groups"),
  );

  assert.equal(groups.length, 3, "free, paid and subscription are seeded");
  assert.ok(groups.every((entry) => entry.sql.includes("ON CONFLICT DO NOTHING")));
});

test("the developer account is seeded outside production and not inside it", async () => {
  const previous = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "test";
    const development = await migrate();
    const inserts = development.leases[0].queries.filter((entry) =>
      entry.sql.includes("INSERT INTO users"),
    );

    assert.equal(inserts.length, 1);
    assert.match(inserts[0].sql, /'user_dev'/);

    process.env.NODE_ENV = "production";
    const production = await migrate();

    assert.equal(
      production.leases[0].queries.filter((entry) =>
        entry.sql.includes("INSERT INTO users"),
      ).length,
      0,
      "a live customer database must not gain a dev@local row",
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("ensureColumn adds a column atomically and validates its identifiers", async () => {
  const { pool, poolQueries } = createFakePool();
  const db = createPostgresDatabase({ pool });

  await ensureColumn(db, "models", "legacy_note", "TEXT");

  // `exec` outside a transaction runs on the pool, not on a leased client.
  const statement =
    poolQueries.filter((entry) => entry.sql.startsWith("ALTER TABLE")).at(-1)
      ?.sql ?? "";

  assert.match(statement, /ALTER TABLE IF EXISTS models/);
  assert.match(statement, /ADD COLUMN IF NOT EXISTS legacy_note TEXT/);

  await assert.rejects(
    async () => ensureColumn(db, "models; DROP TABLE users", "x", "TEXT"),
    /unsafe schema identifier/,
  );
  await assert.rejects(
    async () => ensureColumn(db, "models", "x TEXT; DROP TABLE users", "TEXT"),
    /unsafe schema identifier/,
  );
});
