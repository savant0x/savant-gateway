import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { ensureColumn } from "../lib/schema/columns.ts";

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
