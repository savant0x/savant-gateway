import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { ensureColumn } from "../lib/schema/columns.ts";
import { adoptDocumentedApixoKey } from "../lib/schema/providers.ts";

test("ensureColumn adds a missing column exactly once", () => {
  const db = new Database(":memory:");

  db.exec("CREATE TABLE models (id TEXT PRIMARY KEY)");
  ensureColumn(db, "models", "family", "TEXT");
  ensureColumn(db, "models", "family", "TEXT");

  const columns = db.prepare("PRAGMA table_info(models)").all();
  const family = columns.filter((column) => column.name === "family");

  assert.equal(family.length, 1);
});

test("ensureColumn tolerates another process winning the add race", () => {
  const executed = [];
  const handle = {
    // Stale read: the check runs before the other process commits its ALTER.
    prepare: () => ({ all: () => [{ name: "id" }] }),
    exec: (sql) => {
      executed.push(sql);
      throw Object.assign(new Error("duplicate column name: family"), {
        code: "SQLITE_ERROR",
      });
    },
  };

  assert.doesNotThrow(() =>
    ensureColumn(handle, "models", "family", "TEXT"),
  );
  assert.equal(executed.length, 1);
});

test("the Apixo key migration renames only the shipped legacy value", () => {
  const db = new Database(":memory:");

  db.exec(
    "CREATE TABLE providers (slug TEXT PRIMARY KEY, key_env_var TEXT NOT NULL, updated_at TEXT NOT NULL)",
  );
  const insert = db.prepare("INSERT INTO providers VALUES (?, ?, ?)");

  insert.run("apixo", "APIXO_API_KEY", "2026-10-31T00:00:00.000Z");
  insert.run("other", "APIXO_API_KEY", "2026-10-31T00:00:00.000Z");
  insert.run("commandcode", "COMMANDCODE_API_KEY", "2026-10-31T00:00:00.000Z");

  adoptDocumentedApixoKey(db);
  adoptDocumentedApixoKey(db);

  const rows = db
    .prepare("SELECT slug, key_env_var FROM providers ORDER BY slug")
    .all();

  assert.deepEqual(rows, [
    { slug: "apixo", key_env_var: "APIXOAI_API_KEY" },
    { slug: "commandcode", key_env_var: "COMMANDCODE_API_KEY" },
    { slug: "other", key_env_var: "APIXO_API_KEY" },
  ]);
});

test("ensureColumn still surfaces unrelated migration failures", () => {
  const handle = {
    prepare: () => ({ all: () => [] }),
    exec: () => {
      throw Object.assign(new Error("no such table: missing"), {
        code: "SQLITE_ERROR",
      });
    },
  };

  assert.throws(
    () => ensureColumn(handle, "missing", "family", "TEXT"),
    /no such table/,
  );
});
