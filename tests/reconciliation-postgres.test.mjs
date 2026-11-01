import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAdjustment,
  reconcileDatabase,
  recordBaseline,
} from "../lib/storage/ledger/reconciliation.ts";
import { createPostgresDatabase } from "../lib/storage/pg-adapter.ts";
import { migrateDatabase } from "../lib/storage/schema/index.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-30T12:00:00.000Z";

async function fixture(creditMicros = 1000) {
  const { pool, pglite } = await createPgliteDatabase();
  const db = createPostgresDatabase({ pool });

  await migrateDatabase(db);

  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at, credit_micros)
       VALUES ('a', 'a@example.test', 'Account A', 'active', ?, ?)`,
    )
    .run(NOW, creditMicros);

  return { db, pglite };
}

function adjust(db, overrides = {}) {
  return applyAdjustment(db, {
    userId: "a",
    amountMicros: 250,
    kind: "refund",
    reference: "ticket-1001",
    note: "Support refund",
    now: NOW,
    ...overrides,
  });
}

test("an adjustment appends a ledger entry and moves the balance", async () => {
  const { db, pglite } = await fixture();

  try {
    const result = await adjust(db);

    assert.equal(result.ok, true);
    assert.equal(result.created, true);

    const user = await db
      .prepare("SELECT credit_micros FROM users WHERE id = 'a'")
      .get();
    const ledger = await db
      .prepare(
        "SELECT kind, amount_micros, balance_after_micros, reference FROM credit_ledger",
      )
      .all();

    assert.equal(Number(user.credit_micros), 1250);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].kind, "refund");
    assert.equal(ledger[0].reference, "ticket-1001");
    assert.equal(Number(ledger[0].balance_after_micros), 1250);
  } finally {
    await pglite.close();
  }
});

test("a repeated reference is a no-op, not a second credit", async () => {
  const { db, pglite } = await fixture();

  try {
    const first = await adjust(db);
    const second = await adjust(db);

    assert.equal(second.ok, true);
    assert.equal(second.created, false);
    assert.equal(second.entryId, first.entryId);

    const user = await db
      .prepare("SELECT credit_micros FROM users WHERE id = 'a'")
      .get();

    assert.equal(Number(user.credit_micros), 1250);
  } finally {
    await pglite.close();
  }
});

test("a reference reused for a different amount is a conflict", async () => {
  const { db, pglite } = await fixture();

  try {
    await adjust(db);

    assert.deepEqual(await adjust(db, { amountMicros: 999 }), {
      ok: false,
      reason: "reference_conflict",
    });
  } finally {
    await pglite.close();
  }
});

test("a refund cannot exceed the current balance", async () => {
  const { db, pglite } = await fixture(100);

  try {
    assert.deepEqual(await adjust(db, { amountMicros: 101 }), {
      ok: false,
      reason: "exceeds_balance",
    });

    const ledger = await db
      .prepare("SELECT COUNT(*)::int AS total FROM credit_ledger")
      .get();

    assert.equal(Number(ledger.total), 0);
  } finally {
    await pglite.close();
  }
});

test("a debit correction cannot push the account below zero", async () => {
  const { db, pglite } = await fixture(100);

  try {
    assert.deepEqual(
      await adjust(db, { kind: "adjustment", amountMicros: -150 }),
      { ok: false, reason: "exceeds_balance" },
    );

    assert.equal(
      (await adjust(db, { kind: "adjustment", amountMicros: -100 })).ok,
      true,
    );
  } finally {
    await pglite.close();
  }
});

test("invalid amounts and references are refused before any write", async () => {
  const { db, pglite } = await fixture();

  try {
    assert.deepEqual(await adjust(db, { amountMicros: 0 }), {
      ok: false,
      reason: "invalid_amount",
    });
    assert.deepEqual(await adjust(db, { reference: "ab" }), {
      ok: false,
      reason: "invalid_reference",
    });
    assert.deepEqual(await adjust(db, { kind: "refund", amountMicros: -5 }), {
      ok: false,
      reason: "invalid_amount",
    });
    assert.deepEqual(await adjust(db, { userId: "missing" }), {
      ok: false,
      reason: "unknown_user",
    });
  } finally {
    await pglite.close();
  }
});

test("the balance equation reports a balanced account", async () => {
  // The account must already hold the baseline: a baseline is an accounting
  // anchor, not credit, so it does not fund a refund on its own.
  const { db, pglite } = await fixture(1000);

  try {
    assert.equal(
      await recordBaseline(db, {
        userId: "a",
        baselineMicros: 1000,
        note: "opening balance",
        id: "base_1",
        now: NOW,
      }),
      true,
    );
    await adjust(db);

    const report = await reconcileDatabase(db);

    // The migration seeds a local `user_dev` account outside production, so the
    // report covers it as well. Assert on the account this test created rather
    // than on the length of the list.
    const account = report.accounts.find((entry) => entry.userId === "a");

    assert.ok(account, "the account appears in the report");
    assert.equal(account.baselineMicros, 1000);
    assert.equal(account.ledgerMicros, 250);
    assert.equal(account.balanceMicros, 1250);
    assert.equal(account.differenceMicros, 0);
    assert.equal(account.balanced, true);
    assert.equal(report.totals.balanced, true);
    assert.equal(report.totals.adjustmentMicros, 250);
  } finally {
    await pglite.close();
  }
});

test("the latest baseline is the one the equation uses", async () => {
  const { db, pglite } = await fixture(500);

  try {
    await recordBaseline(db, {
      userId: "a",
      baselineMicros: 100,
      note: "first",
      id: "base_1",
      now: "2026-10-30T10:00:00.000Z",
    });
    await recordBaseline(db, {
      userId: "a",
      baselineMicros: 500,
      note: "second",
      id: "base_2",
      now: "2026-10-30T11:00:00.000Z",
    });

    const report = await reconcileDatabase(db);

    assert.equal(report.accounts[0].baselineMicros, 500);
    assert.equal(report.accounts[0].balanced, true);
  } finally {
    await pglite.close();
  }
});

test("an unbalanced account is reported rather than repaired", async () => {
  const { db, pglite } = await fixture(1000);

  try {
    await recordBaseline(db, {
      userId: "a",
      baselineMicros: 400,
      note: "opening balance",
      id: "base_1",
      now: NOW,
    });

    const report = await reconcileDatabase(db);

    assert.equal(report.accounts[0].differenceMicros, 600);
    assert.equal(report.accounts[0].balanced, false);
    assert.equal(report.totals.balanced, false);
  } finally {
    await pglite.close();
  }
});
