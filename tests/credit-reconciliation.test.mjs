import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { creditAdjustmentSchema } from "../lib/schema/credits.ts";
import {
  applyAdjustment,
  reconcileDatabase,
  recordBaseline,
} from "../lib/reconciliation.ts";

const NOW = "2026-10-30T12:00:00.000Z";

function fixture(balance = 500) {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, credit_micros INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE credit_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      amount_micros INTEGER NOT NULL,
      balance_after_micros INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE usage_events (id TEXT PRIMARY KEY, charged_micros INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE topups (id TEXT PRIMARY KEY, amount_micros INTEGER NOT NULL, status TEXT NOT NULL);
    CREATE TABLE credit_holds (id TEXT PRIMARY KEY, hold_micros INTEGER NOT NULL);
    CREATE TABLE quarantined_holds (id TEXT PRIMARY KEY, kind TEXT, status TEXT, reserved INTEGER);
    INSERT INTO users VALUES ('a', ${balance}), ('b', 0);
  `);
  creditAdjustmentSchema(db);

  return db;
}

function adjust(db, overrides = {}) {
  return applyAdjustment(db, {
    userId: "a",
    amountMicros: 100,
    kind: "refund",
    reference: "refund-001",
    note: "Duplicate charge",
    now: NOW,
    ...overrides,
  });
}

test("a balance that equals its ledger reconciles without correction", () => {
  const db = fixture();

  try {
    db.prepare(
      `INSERT INTO credit_ledger
        (id, user_id, kind, amount_micros, balance_after_micros, created_at)
       VALUES ('l1', 'a', 'grant', 500, 500, ?)`,
    ).run(NOW);
    const report = reconcileDatabase(db);
    const account = report.accounts.find((row) => row.userId === "a");

    assert.equal(account.balanced, true);
    assert.equal(account.differenceMicros, 0);
    assert.equal(report.totals.balanced, true);
  } finally {
    db.close();
  }
});

test("a legacy gap is reported and only an explicit baseline resolves it", () => {
  const db = fixture();

  try {
    const before = reconcileDatabase(db).accounts.find((row) => row.userId === "a");

    assert.equal(before.balanced, false);
    assert.equal(before.differenceMicros, 500);

    assert.equal(
      recordBaseline(db, {
        id: "baseline_1",
        userId: "a",
        baselineMicros: 500,
        note: "Opening balance before ledger coverage",
        now: NOW,
      }),
      true,
    );

    const after = reconcileDatabase(db).accounts.find((row) => row.userId === "a");

    assert.equal(after.balanced, true);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM credit_ledger").get().n,
      0,
      "a baseline must not fabricate a ledger row",
    );
  } finally {
    db.close();
  }
});

test("a refund appends once per reference", () => {
  const db = fixture(500);

  try {
    db.prepare(
      `INSERT INTO credit_ledger
        (id, user_id, kind, amount_micros, balance_after_micros, created_at)
       VALUES ('seed', 'a', 'grant', 500, 500, ?)`,
    ).run(NOW);
    const first = adjust(db);
    const replay = adjust(db);

    assert.equal(first.ok, true);
    assert.equal(first.created, true);
    assert.equal(replay.ok, true);
    assert.equal(replay.created, false);
    assert.equal(
      db.prepare("SELECT credit_micros FROM users WHERE id = 'a'").get()
        .credit_micros,
      600,
    );
    assert.equal(
      db
        .prepare("SELECT COUNT(*) AS n FROM credit_ledger WHERE reference IS NOT NULL")
        .get().n,
      1,
    );
    assert.equal(reconcileDatabase(db).totals.balanced, true);
  } finally {
    db.close();
  }
});

test("the same reference with different terms is a conflict", () => {
  const db = fixture();

  try {
    adjust(db);
    const conflict = adjust(db, { amountMicros: 200 });
    const otherUser = adjust(db, { userId: "b" });

    assert.equal(conflict.ok, false);
    assert.equal(conflict.reason, "reference_conflict");
    assert.equal(otherUser.reason, "reference_conflict");
    assert.equal(
      db.prepare("SELECT credit_micros FROM users WHERE id = 'a'").get()
        .credit_micros,
      600,
    );
  } finally {
    db.close();
  }
});

test("a refund cannot exceed the balance and partial refunds are allowed", () => {
  const db = fixture(50);

  try {
    const tooLarge = adjust(db, { amountMicros: 51 });

    assert.equal(tooLarge.ok, false);
    assert.equal(tooLarge.reason, "exceeds_balance");

    const partial = adjust(db, {
      amountMicros: 25,
      reference: "refund-partial",
    });

    assert.equal(partial.ok, true);
    assert.equal(
      db.prepare("SELECT credit_micros FROM users WHERE id = 'a'").get()
        .credit_micros,
      75,
    );
  } finally {
    db.close();
  }
});

test("an overdrawn account stays visible and cannot be pushed further down", () => {
  const db = fixture(-30);

  try {
    db.prepare(
      `INSERT INTO credit_ledger
        (id, user_id, kind, amount_micros, balance_after_micros, created_at)
       VALUES ('l1', 'a', 'usage', -30, -30, ?)`,
    ).run(NOW);

    assert.equal(reconcileDatabase(db).totals.balanced, true);

    const debit = adjust(db, {
      amountMicros: -10,
      kind: "adjustment",
      reference: "adjust-debit",
    });

    assert.equal(debit.ok, false);
    assert.equal(debit.reason, "exceeds_balance");
  } finally {
    db.close();
  }
});

test("invalid references and amounts are refused before any write", () => {
  const db = fixture();

  try {
    for (const candidate of [
      { amountMicros: 0 },
      { amountMicros: 1.5 },
      { amountMicros: -5, kind: "refund" },
      { reference: "  " },
      { reference: "ab" },
    ]) {
      const result = adjust(db, candidate);

      assert.equal(result.ok, false, JSON.stringify(candidate));
    }

    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM credit_ledger").get().n, 0);
  } finally {
    db.close();
  }
});

test("reports include usage debits, paid top-ups and reserved money", () => {
  const db = fixture();

  try {
    db.prepare("INSERT INTO usage_events VALUES ('u1', 200)").run();
    db.prepare("INSERT INTO topups VALUES ('t1', 900, 'paid'), ('t2', 500, 'pending')").run();
    db.prepare("INSERT INTO credit_holds VALUES ('h1', 40)").run();
    db.prepare("INSERT INTO quarantined_holds VALUES ('q1', 'credit', 'quarantined', 60)").run();

    const totals = reconcileDatabase(db).totals;

    assert.equal(totals.usageDebitsMicros, 200);
    assert.equal(totals.topupMicros, 900);
    assert.equal(totals.heldMicros, 40);
    assert.equal(totals.quarantinedMicros, 60);
    assert.equal(totals.adjustmentMicros, 0);
  } finally {
    db.close();
  }
});
