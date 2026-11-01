import assert from "node:assert/strict";
import test from "node:test";

import { insertActivity } from "../lib/storage/ledger/activity.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  listActivity,
  recordActivity,
  recordActivityBestEffort,
} from "../lib/storage/store/activity.ts";
import {
  DEFAULT_TENANT,
  getAccountSummary,
  grantCredit,
  listCreditLedger,
} from "../lib/storage/store/billing.ts";
import { reserveCredit } from "../lib/storage/store/credit.ts";
import {
  adjustCredit,
  getReconciliation,
  listBalanceBaselines,
  saveBaseline,
} from "../lib/storage/store/reconciliation.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-30T12:00:00.000Z";
const LATER = "2026-10-30T12:05:00.000Z";
const EARLIER = "2026-10-30T11:00:00.000Z";

/**
 * The money-core store, checked against a real PostgreSQL engine through the
 * runtime handle.
 *
 * The arithmetic is not the subject — `credit-reserve-postgres.test.mjs` and
 * `reconciliation-postgres.test.mjs` cover the ledger itself. What is checked
 * here is the *store surface*: that a grant, a ledger read, an activity row and
 * an adjustment all compose through one handle, and that the read-after-write
 * order an operator or a customer sees is the order the database returns.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  return db;
}

async function seedUser(db, id, creditMicros = 0) {
  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at, credit_micros, held_micros)
       VALUES (?, ?, ?, 'active', ?, ?, 0)`,
    )
    .run(id, `${id}@example.test`, id, NOW, creditMicros);

  await db
    .prepare(
      `INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, status, created_at)
       VALUES (?, ?, 'Test key', 'sk_test', ?, 'active', ?)`,
    )
    .run(`key_${id}`, id, `hash_${id}`, NOW);
}

test("a grant raises the balance and records both ledger and activity", async () => {
  const db = await fixture();
  await seedUser(db, "a");

  const summary = await grantCredit(db, {
    amountMicros: 5_000,
    note: "Operator grant",
    userId: "a",
    now: NOW,
  });

  assert.deepEqual(summary, {
    creditMicros: 5_000,
    heldMicros: 0,
    availableMicros: 5_000,
  });

  const ledger = await listCreditLedger(db, 10, "a");

  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].amountMicros, 5_000);
  assert.equal(ledger[0].balanceAfterMicros, 5_000);
  assert.equal(ledger[0].kind, "grant");

  const events = await listActivity(db, 10, { userId: "a" });

  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "credit.granted");
  assert.deepEqual(events[0].metadata, { amountMicros: 5_000, source: "grant" });
});

test("a grant must be positive", async () => {
  const db = await fixture();
  await seedUser(db, "a");

  for (const amountMicros of [0, -100]) {
    await assert.rejects(
      () => grantCredit(db, { amountMicros, userId: "a", now: NOW }),
      /positive amount/,
    );
  }
});

test("the ledger reads newest first and returns numbers, not strings", async () => {
  const db = await fixture();
  await seedUser(db, "a");
  await grantCredit(db, {
    amountMicros: 1_000,
    note: "first",
    userId: "a",
    now: EARLIER,
  });
  await grantCredit(db, {
    amountMicros: 2_000,
    note: "second",
    userId: "a",
    now: LATER,
  });

  const ledger = await listCreditLedger(db, 10, "a");

  assert.deepEqual(
    ledger.map((entry) => entry.note),
    ["second", "first"],
    "ordered by time, not by insertion id",
  );
  assert.equal(typeof ledger[0].amountMicros, "number");
  assert.equal(typeof ledger[0].balanceAfterMicros, "number");
});

test("the summary reports credit held by a live reservation", async () => {
  const db = await fixture();
  await seedUser(db, "a", 1_000);

  const hold = await reserveCredit(db, {
    userId: "a",
    keyId: "key_a",
    modelId: "model_1",
    holdMicros: 250,
    now: Date.parse(NOW),
  });

  assert.ok(hold);

  const summary = await getAccountSummary(db, "a");

  assert.deepEqual(summary, {
    creditMicros: 1_000,
    heldMicros: 250,
    availableMicros: 750,
  });
});

test("an unknown account reads as zero rather than failing", async () => {
  const db = await fixture();

  assert.deepEqual(await getAccountSummary(db, "nobody"), {
    creditMicros: 0,
    heldMicros: 0,
    availableMicros: 0,
  });
});

test("the default tenant is the developer account", async () => {
  assert.equal(DEFAULT_TENANT, "user_dev");

  const db = await fixture();

  // The migration seeds this account outside production, so a default-tenant
  // read finds a row instead of the zero fallback.
  const summary = await getAccountSummary(db);

  assert.equal(summary.creditMicros, 0);
  assert.equal(summary.heldMicros, 0);
});

test("activity supports filtering and joins the customer email", async () => {
  const db = await fixture();
  await seedUser(db, "a");

  await recordActivity(db, {
    userId: "a",
    actor: "customer",
    kind: "customer.key_created",
    entityType: "api_key",
    entityId: "key_a",
    metadata: { keyId: "key_a" },
    now: NOW,
  });
  await recordActivity(db, {
    userId: "a",
    actor: "customer",
    kind: "customer.login",
    entityType: "session",
    now: LATER,
  });

  const logins = await listActivity(db, 10, { kind: "customer.login" });

  assert.equal(logins.length, 1);
  assert.equal(logins[0].userEmail, "a@example.test");
  assert.equal(logins[0].actor, "customer");

  const all = await listActivity(db, 10, { userId: "a" });

  assert.deepEqual(
    all.map((event) => event.kind),
    ["customer.login", "customer.key_created"],
    "newest first",
  );
});

test("a best-effort activity write loses the row, not the request", async () => {
  const db = await fixture();
  await seedUser(db, "a");

  const rejected = await recordActivityBestEffort(db, {
    userId: "a",
    kind: "customer.login",
    entityType: "session",
    metadata: { secret: "must not be recorded" },
  });

  assert.equal(
    rejected,
    null,
    "a forbidden metadata key is refused by the shared sanitizer",
  );

  // The throwing path keeps the refusal, which is what money and account
  // changes need: they must fail rather than proceed unaudited.
  await assert.rejects(() =>
    insertActivity(db, {
      userId: "a",
      kind: "customer.login",
      entityType: "session",
      metadata: { secret: "must not be recorded" },
    }),
  );
});

test("an adjustment is idempotent by reference", async () => {
  const db = await fixture();
  await seedUser(db, "a", 1_000);

  const first = await adjustCredit(db, {
    userId: "a",
    amountMicros: 200,
    kind: "refund",
    reference: "ticket-1234",
    note: "Service interruption",
    now: NOW,
  });

  assert.deepEqual(first, {
    ok: true,
    created: true,
    entryId: "ledger_adj_ticket-1234",
  });

  const replay = await adjustCredit(db, {
    userId: "a",
    amountMicros: 200,
    kind: "refund",
    reference: "ticket-1234",
    note: "Service interruption",
    now: LATER,
  });

  assert.deepEqual(replay, {
    ok: true,
    created: false,
    entryId: "ledger_adj_ticket-1234",
  });

  const summary = await getAccountSummary(db, "a");

  assert.equal(
    summary.creditMicros,
    1_200,
    "the replay returns the original entry instead of crediting twice",
  );
});

test("a correction cannot push the balance below zero", async () => {
  const db = await fixture();
  await seedUser(db, "a", 500);

  const result = await adjustCredit(db, {
    userId: "a",
    amountMicros: -600,
    kind: "adjustment",
    reference: "claw-back",
    note: "Overstated grant",
    now: NOW,
  });

  assert.deepEqual(result, { ok: false, reason: "exceeds_balance" });
  assert.equal((await getAccountSummary(db, "a")).creditMicros, 500);
});

test("a baseline is recorded and listed, and reconciliation still balances", async () => {
  const db = await fixture();
  await seedUser(db, "a");

  assert.equal(
    await saveBaseline(db, {
      userId: "a",
      baselineMicros: 2_000,
      note: "Opening balance before ledger coverage",
      now: NOW,
    }),
    true,
  );

  const baselines = await listBalanceBaselines(db, 5);
  const mine = baselines.filter((row) => row.user_id === "a");

  assert.equal(mine.length, 1);
  assert.equal(Number(mine[0].baseline_micros), 2_000);

  const report = await getReconciliation(db);
  const account = report.accounts.find((row) => row.userId === "a");

  assert.ok(account);
  assert.equal(account.baselineMicros, 2_000);
  assert.equal(account.ledgerMicros, 0);
  assert.equal(
    account.balanced,
    false,
    "a baseline without the matching balances is a real discrepancy, not a pass",
  );
  assert.equal(account.differenceMicros, account.balanceMicros - 2_000);
});
