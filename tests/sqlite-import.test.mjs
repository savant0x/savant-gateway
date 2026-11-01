import assert from "node:assert/strict";
import test from "node:test";

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { importSqlite, ImportRefused } from "../scripts/sqlite-import.mjs";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-31T12:00:00.000Z";

/**
 * The importer's contract (FID-2026-1031-086 D-3).
 *
 * The subject is what happens when the source and the target disagree. Counts
 * must match, balances must be reconstructible from the ledger, a mismatch must
 * leave the target untouched, and the source file must be byte-identical after
 * the run — otherwise a failed import destroys the only record of what was
 * migrated.
 *
 * The fixture tables carry only the columns the target also has, because the
 * importer refuses to drop a column. The one test that adds a column is proving
 * exactly that refusal.
 */
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "gateway-import-"));
  const sourcePath = join(directory, "gateway.db");
  const source = new Database(sourcePath);

  source.exec(`
    CREATE TABLE providers (
      slug TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      base_url TEXT NOT NULL,
      key_env_var TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE model_groups (
      slug TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      billing_mode TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE models (
      id TEXT PRIMARY KEY,
      upstream_id TEXT NOT NULL,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      context_window TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      sell_input_micros INTEGER NOT NULL DEFAULT 0,
      sell_output_micros INTEGER NOT NULL DEFAULT 0,
      price_source TEXT NOT NULL DEFAULT 'auto',
      in_catalog INTEGER NOT NULL DEFAULT 1,
      group_slug TEXT
    );
    CREATE TABLE plans (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      interval TEXT NOT NULL,
      price_micros INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE plan_models (
      plan_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      PRIMARY KEY (plan_id, model_id)
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      credit_micros INTEGER NOT NULL DEFAULT 0,
      held_micros INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT
    );
    CREATE TABLE api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE TABLE credit_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      amount_micros INTEGER NOT NULL,
      balance_after_micros INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE credit_holds (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      hold_micros INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE topups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'stripe',
      provider_ref TEXT NOT NULL,
      amount_micros INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      paid_at TEXT
    );
  `);

  source
    .prepare(
      `INSERT INTO providers (slug, label, base_url, key_env_var, created_at, updated_at)
       VALUES ('savant', 'Savant', 'https://api.example.test/v1', 'PROVIDER_KEY', ?, ?),
              ('apixo', 'Apixo', 'https://api.apixoai.online/v1', 'APIXOAI_API_KEY', ?, ?)`,
    )
    .run(NOW, NOW, NOW, NOW);

  source
    .prepare(
      `INSERT INTO model_groups (slug, label, billing_mode, created_at, updated_at)
       VALUES ('paid', 'Paid', 'paid', ?, ?),
              ('free', 'Free', 'free', ?, ?)`,
    )
    .run(NOW, NOW, NOW, NOW);

  source
    .prepare(
      `INSERT INTO models
        (id, upstream_id, name, provider, context_window, synced_at,
         sell_input_micros, sell_output_micros, price_source, in_catalog,
         group_slug)
       VALUES ('gpt-x', 'gpt-x', 'GPT X', 'GPT', '128k', ?, 125000, 250000,
               'manual', 1, 'paid'),
              ('free-x', 'free/x', 'Free X', 'Free', '8k', ?, 0, 0, 'auto', 1,
               'free')`,
    )
    .run(NOW, NOW);

  source
    .prepare(
      `INSERT INTO plans
        (id, slug, name, status, interval, price_micros, created_at, updated_at)
       VALUES ('plan_1', 'starter', 'Starter', 'active', 'month', 9990000, ?, ?)`,
    )
    .run(NOW, NOW);

  source
    .prepare("INSERT INTO plan_models (plan_id, model_id) VALUES (?, ?)")
    .run("plan_1", "gpt-x");

  source
    .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)")
    .run("pricing.markup_bps", "1800", NOW);

  source.close();

  return { directory, sourcePath };
}

function addCustomer(
  sourcePath,
  { creditMicros = 300_000, ledgerTotal = creditMicros } = {},
) {
  const source = new Database(sourcePath);

  source
    .prepare(
      `INSERT INTO users
        (id, email, name, status, created_at, credit_micros, held_micros,
         password_hash)
       VALUES ('cust_1', 'one@example.test', 'One', 'active', ?, ?, 50000,
               'hash_1')`,
    )
    .run(NOW, creditMicros);

  source
    .prepare(
      `INSERT INTO api_keys
        (id, user_id, name, prefix, secret_hash, status, created_at)
       VALUES ('key_1', 'cust_1', 'Key', 'sk_live', 'hash_1', 'active', ?)`,
    )
    .run(NOW);

  const ledger = source.prepare(
    `INSERT INTO credit_ledger
      (id, user_id, kind, amount_micros, balance_after_micros, note, created_at)
     VALUES (?, 'cust_1', ?, ?, ?, ?, ?)`,
  );

  ledger.run("ledger_1", "topup", 500_000, 500_000, "Credit top-up", NOW);
  ledger.run(
    "ledger_2",
    "usage",
    ledgerTotal - 500_000,
    creditMicros,
    null,
    NOW,
  );

  source
    .prepare(
      `INSERT INTO credit_holds
        (id, user_id, model_id, hold_micros, created_at, expires_at)
       VALUES ('hold_1', 'cust_1', 'gpt-x', 50000, ?, ?)`,
    )
    .run(NOW, NOW);

  source
    .prepare(
      `INSERT INTO topups
        (id, user_id, provider, provider_ref, amount_micros, currency, status,
         created_at, paid_at)
       VALUES ('topup_1', 'cust_1', 'nowpayments', 'np_ref_1', 500000, 'usd',
               'paid', ?, ?)`,
    )
    .run(NOW, NOW);

  source.close();
}

async function target() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  return db;
}

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function cleanup(directory) {
  rmSync(directory, { recursive: true, force: true });
}

test("configuration imports with equal counts and unchanged source bytes", async () => {
  const { directory, sourcePath } = fixture();
  const db = await target();

  try {
    const before = digest(sourcePath);
    const report = await importSqlite({ sourcePath, db });

    assert.equal(report.digestBefore, report.digestAfter);
    assert.equal(digest(sourcePath), before, "the source file must not change");
    assert.equal(report.includeCustomers, false);

    for (const row of report.tables) {
      assert.equal(
        row.inserted,
        row.sourceCount,
        `${row.table} must import every source row`,
      );
    }

    const models = await db.query(
      "SELECT id, sell_input_micros, sell_output_micros FROM models ORDER BY id",
    );

    assert.equal(models.length, 2);

    const paid = models.find((row) => row.id === "gpt-x");

    assert.equal(Number(paid.sell_input_micros), 125_000);
    assert.equal(Number(paid.sell_output_micros), 250_000);

    const users = await db.query("SELECT id FROM users");

    assert.deepEqual(
      users.map((row) => row.id),
      ["user_dev"],
      "a config-only import must not create customers",
    );

    const markup = await db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get("pricing.markup_bps");

    assert.equal(markup.value, "1800", "the operator's markup wins over the seed");
  } finally {
    await db.close();
    cleanup(directory);
  }
});

test("customer rows import only on request, with balances recomputed", async () => {
  const { directory, sourcePath } = fixture();
  addCustomer(sourcePath);
  const db = await target();

  try {
    const report = await importSqlite({
      sourcePath,
      db,
      includeCustomers: true,
    });

    assert.equal(report.balances.checked, 2, "dev user and cust_1");

    const user = await db
      .prepare(
        "SELECT credit_micros, held_micros FROM users WHERE id = 'cust_1'",
      )
      .get();

    assert.equal(Number(user.credit_micros), 300_000);
    assert.equal(Number(user.held_micros), 50_000);

    const ledger = await db
      .prepare(
        `SELECT COALESCE(SUM(amount_micros), 0) AS total
           FROM credit_ledger WHERE user_id = 'cust_1'`,
      )
      .get();

    assert.equal(Number(ledger.total), 300_000);

    const keys = await db.prepare("SELECT COUNT(*) AS n FROM api_keys").get();

    assert.equal(Number(keys.n), 1);
  } finally {
    await db.close();
    cleanup(directory);
  }
});

test("a balance that the ledger cannot reconstruct aborts the whole import", async () => {
  const { directory, sourcePath } = fixture();
  addCustomer(sourcePath, { creditMicros: 999_999, ledgerTotal: 300_000 });
  const db = await target();

  try {
    await assert.rejects(
      () => importSqlite({ sourcePath, db, includeCustomers: true }),
      (error) => {
        assert.equal(error instanceof ImportRefused, true);
        assert.match(error.message, /cannot be reconstructed/);
        assert.match(error.details.join(" "), /cust_1/);

        return true;
      },
    );

    const models = await db.prepare("SELECT COUNT(*) AS n FROM models").get();
    const users = await db.prepare("SELECT COUNT(*) AS n FROM users").get();

    assert.equal(Number(models.n), 0, "the configuration copy must roll back");
    assert.equal(Number(users.n), 1, "only the seeded dev user remains");
  } finally {
    await db.close();
    cleanup(directory);
  }
});

test("a target that already holds customers is refused", async () => {
  const { directory, sourcePath } = fixture();
  const db = await target();

  try {
    await importSqlite({ sourcePath, db });

    await db
      .prepare(
        `INSERT INTO users (id, email, name, status, created_at)
         VALUES ('cust_live', 'live@example.test', 'Live', 'active', ?)`,
      )
      .run(NOW);

    await assert.rejects(
      () => importSqlite({ sourcePath, db }),
      (error) => {
        assert.equal(error instanceof ImportRefused, true);
        assert.match(error.message, /already holds 1 customer/);

        return true;
      },
    );

    const models = await db.prepare("SELECT COUNT(*) AS n FROM models").get();

    assert.equal(Number(models.n), 2, "the earlier import is untouched");
  } finally {
    await db.close();
    cleanup(directory);
  }
});

test("a source column the target lacks is named, not dropped", async () => {
  const { directory, sourcePath } = fixture();
  const source = new Database(sourcePath);

  source.exec("ALTER TABLE models ADD COLUMN legacy_only TEXT");
  source.close();

  const db = await target();

  try {
    await assert.rejects(() => importSqlite({ sourcePath, db }), (error) => {
      assert.equal(error instanceof ImportRefused, true);
      assert.match(error.message, /missing columns/);
      assert.deepEqual(error.details, ["models.legacy_only"]);

      return true;
    });

    const models = await db.prepare("SELECT COUNT(*) AS n FROM models").get();

    assert.equal(Number(models.n), 0);
  } finally {
    await db.close();
    cleanup(directory);
  }
});
