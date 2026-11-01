import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresDatabase } from "../lib/storage/pg-adapter.ts";
import {
  claimPaymentEvent,
  CLAIM_GRACE_MS,
  completePaymentEvent,
  failPaymentEvent,
  listPaymentEvents,
  quarantinePaymentEvent,
} from "../lib/storage/ledger/payments.ts";
import {
  commitSettlement,
  creditBalance,
  debitCredit,
  listQuarantinedHolds,
  listSettlements,
  openSettlement,
  quarantineHold,
  quarantinedWeight,
  releaseQuarantinedHold,
  settlementStatus,
} from "../lib/storage/ledger/settlements.ts";
import { migrateDatabase } from "../lib/storage/schema/index.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-30T12:00:00.000Z";
const LATER = "2026-10-30T12:15:00.000Z";

/**
 * Every test here runs against PGlite — a real PostgreSQL engine — over the
 * actual ported migration. That means the DDL is parsed and executed, the
 * constraints and foreign keys are enforced, and the ledger's SQL is checked
 * by PostgreSQL rather than by a stand-in.
 */
async function fixture() {
  const { pool, pglite } = await createPgliteDatabase();
  const db = createPostgresDatabase({ pool });

  await migrateDatabase(db);

  await db.exec(`
    INSERT INTO users (id, email, name, status, created_at, credit_micros, held_micros)
    VALUES ('a', 'a@example.test', 'Account A', 'active', '${NOW}', 500, 500),
           ('b', 'b@example.test', 'Account B', 'active', '${NOW}', 0, 0);

    INSERT INTO plans
      (id, slug, name, status, price_micros, currency, interval,
       included_weighted_tokens, overage_mode, overage_markup_bps,
       sort_order, created_at, updated_at)
    VALUES ('plan_1', 'starter', 'Starter', 'active', 1000, 'usd', 'month',
            1000, 'block', 0, 0, '${NOW}', '${NOW}');

    INSERT INTO subscriptions
      (id, user_id, plan_id, status, source, plan_name_snapshot,
       price_micros_snapshot, currency_snapshot, interval_snapshot,
       included_weighted_tokens_snapshot, overage_mode_snapshot,
       overage_markup_bps_snapshot, current_period_start, current_period_end,
       created_at, updated_at)
    VALUES ('sub_1', 'a', 'plan_1', 'active', 'manual', 'Starter',
            1000, 'usd', 'month', 1000, 'block', 0, '${NOW}', '${LATER}',
            '${NOW}', '${NOW}');

    INSERT INTO subscription_periods
      (id, subscription_id, period_start, period_end,
       included_weighted_tokens, weighted_tokens_held, created_at)
    VALUES ('period_a', 'sub_1', '${NOW}', '${LATER}', 1000, 400, '${NOW}');
  `);

  return { db, pglite };
}

function admit(db, overrides = {}) {
  return openSettlement(
    db,
    {
      id: "stl_1",
      userId: "a",
      keyId: "key_a",
      modelId: "model",
      providerSlug: "savant",
      billingSource: "credit",
      creditHoldId: "hold_1",
      freeReservationId: null,
      subscriptionHoldId: null,
      estimatedMicros: 147,
      ...overrides,
    },
    NOW,
  );
}

test("the migration parses and executes on a real PostgreSQL engine", async () => {
  const { db, pglite } = await fixture();

  try {
    const row = await db
      .prepare(
        `SELECT COUNT(*)::int AS total FROM information_schema.tables
          WHERE table_schema = 'public'`,
      )
      .get();

    assert.ok(
      Number(row.total) >= 40,
      `expected at least 40 tables, saw ${row.total}`,
    );
  } finally {
    await pglite.close();
  }
});

test("a settlement admits once and commits once", async () => {
  const { db, pglite } = await fixture();

  try {
    assert.equal(await admit(db), "stl_1");
    assert.equal(await settlementStatus(db, "stl_1"), "admitted");
    assert.equal(await commitSettlement(db, "stl_1", NOW), true);
    assert.equal(await settlementStatus(db, "stl_1"), "committed");
    assert.equal(await commitSettlement(db, "stl_1", LATER), false);
    assert.equal((await listSettlements(db)).length, 1);
  } finally {
    await pglite.close();
  }
});

test("an unknown settlement cannot be claimed", async () => {
  const { db, pglite } = await fixture();

  try {
    assert.equal(await commitSettlement(db, "stl_missing", NOW), false);
  } finally {
    await pglite.close();
  }
});

test("quarantine keeps credit reserved until an audited release", async () => {
  const { db, pglite } = await fixture();

  try {
    await admit(db);
    const quarantined = await quarantineHold(db, {
      id: "hold_1",
      kind: "credit",
      userId: "a",
      keyId: "key_a",
      modelId: "model",
      reserved: 147,
      createdAt: NOW,
      expiredAt: LATER,
    });

    assert.equal(quarantined, true);
    assert.equal(await settlementStatus(db, "stl_1"), "quarantined");

    const held = await db
      .prepare("SELECT held_micros FROM users WHERE id = 'a'")
      .get();

    assert.equal(
      Number(held.held_micros),
      500,
      "expiry must not refund the reservation",
    );
    assert.equal(await commitSettlement(db, "stl_1", LATER), false);

    assert.equal(
      await releaseQuarantinedHold(db, { id: "hold_1", releasedAt: LATER }),
      true,
    );

    const released = await db
      .prepare("SELECT held_micros FROM users WHERE id = 'a'")
      .get();

    assert.equal(Number(released.held_micros), 353);
    assert.equal(
      await releaseQuarantinedHold(db, { id: "hold_1", releasedAt: LATER }),
      false,
      "a release happens once",
    );
    assert.equal((await listQuarantinedHolds(db))[0].status, "released");
  } finally {
    await pglite.close();
  }
});

test("subscription and free quarantine hold their own capacity", async () => {
  const { db, pglite } = await fixture();

  try {
    await admit(db, {
      id: "stl_2",
      billingSource: "subscription",
      creditHoldId: null,
      subscriptionHoldId: "subhold_1",
    });
    await quarantineHold(db, {
      id: "subhold_1",
      kind: "subscription",
      userId: "a",
      keyId: "key_a",
      modelId: "model",
      periodId: "period_a",
      reserved: 400,
      createdAt: NOW,
      expiredAt: LATER,
    });

    assert.equal(await settlementStatus(db, "stl_2"), "quarantined");

    const period = await db
      .prepare("SELECT weighted_tokens_held FROM subscription_periods")
      .get();

    assert.equal(Number(period.weighted_tokens_held), 400);

    await releaseQuarantinedHold(db, { id: "subhold_1", releasedAt: LATER });

    const released = await db
      .prepare("SELECT weighted_tokens_held FROM subscription_periods")
      .get();

    assert.equal(Number(released.weighted_tokens_held), 0);

    await quarantineHold(db, {
      id: "free_1",
      kind: "free",
      userId: "a",
      keyId: "key_a",
      modelId: "model",
      reserved: 90,
      createdAt: NOW,
      expiredAt: LATER,
    });

    assert.equal(await quarantinedWeight(db, "a", "free"), 90);
    await releaseQuarantinedHold(db, { id: "free_1", releasedAt: LATER });
    assert.equal(await quarantinedWeight(db, "a", "free"), 0);
  } finally {
    await pglite.close();
  }
});

test("quarantine is idempotent for the same reservation", async () => {
  const { db, pglite } = await fixture();
  const row = {
    id: "hold_9",
    kind: "credit",
    userId: "a",
    keyId: null,
    modelId: null,
    reserved: 10,
    createdAt: NOW,
    expiredAt: LATER,
  };

  try {
    assert.equal(await quarantineHold(db, row), true);
    assert.equal(await quarantineHold(db, row), false);
    assert.equal((await listQuarantinedHolds(db)).length, 1);
  } finally {
    await pglite.close();
  }
});

test("a balance cannot be debited twice past zero", async () => {
  const { db, pglite } = await fixture();

  try {
    await db.prepare("UPDATE users SET credit_micros = ? WHERE id = 'a'").run(100);

    const first = await debitCredit(db, { userId: "a", micros: 60 });
    const second = await debitCredit(db, { userId: "a", micros: 60 });

    assert.deepEqual(first, { ok: true, balanceMicros: 40 });
    assert.deepEqual(second, { ok: false, reason: "insufficient_credit" });

    const balance = await creditBalance(db, "a");

    assert.equal(balance.creditMicros, 40);
    assert.equal(
      balance.availableMicros,
      0,
      "the 500 still held cannot be spent twice",
    );
  } finally {
    await pglite.close();
  }
});

test("a rolled-back debit leaves the balance untouched", async () => {
  const { db, pglite } = await fixture();

  try {
    await db.prepare("UPDATE users SET credit_micros = ? WHERE id = 'a'").run(100);

    await assert.rejects(async () =>
      db.transaction(async () => {
        const outcome = await debitCredit(db, { userId: "a", micros: 100 });

        assert.deepEqual(outcome, { ok: true, balanceMicros: 0 });

        throw new Error("settlement failed after the debit");
      })(),
    );

    const row = await db
      .prepare("SELECT credit_micros FROM users WHERE id = 'a'")
      .get();

    assert.equal(Number(row.credit_micros), 100);
  } finally {
    await pglite.close();
  }
});

test("micro amounts round-trip through BIGINT without narrowing", async () => {
  const { db, pglite } = await fixture();

  try {
    const max = Number.MAX_SAFE_INTEGER;

    await db
      .prepare("UPDATE users SET credit_micros = ? WHERE id = 'a'")
      .run(max);

    const row = await db
      .prepare("SELECT credit_micros FROM users WHERE id = 'a'")
      .get();

    assert.equal(Number(row.credit_micros), max);
  } finally {
    await pglite.close();
  }
});

const NOW_MS = Date.parse("2026-10-30T12:00:00.000Z");
const STALE_MS = NOW_MS + CLAIM_GRACE_MS + 1;

function claim(db, overrides = {}) {
  return claimPaymentEvent(db, {
    id: "evt_1",
    type: "checkout.session.completed",
    livemode: true,
    expectedLivemode: null,
    now: NOW_MS,
    ...overrides,
  });
}

test("an event is claimed once and answered as in-flight while recent", async () => {
  const { db, pglite } = await fixture();

  try {
    assert.deepEqual(await claim(db), { ok: true, attempt: 1 });
    assert.deepEqual(await claim(db), { ok: false, reason: "in_flight" });

    const row = await db
      .prepare("SELECT attempts FROM billing_events WHERE id = 'evt_1'")
      .get();

    assert.equal(Number(row.attempts), 1);
  } finally {
    await pglite.close();
  }
});

test("a stale claim can be retried after a crash", async () => {
  const { db, pglite } = await fixture();

  try {
    await claim(db);
    const retry = await claim(db, { now: STALE_MS });

    assert.equal(retry.ok, true);
    assert.equal(retry.attempt, 2);

    const row = await db.prepare("SELECT status, attempts FROM billing_events").get();

    assert.equal(row.status, "claimed");
    assert.equal(Number(row.attempts), 2);
  } finally {
    await pglite.close();
  }
});

test("a processed event is terminal", async () => {
  const { db, pglite } = await fixture();

  try {
    await claim(db);
    await completePaymentEvent(db, "evt_1", "2026-10-30T12:00:01.000Z");

    assert.deepEqual(await claim(db, { now: STALE_MS }), {
      ok: false,
      reason: "processed",
    });
  } finally {
    await pglite.close();
  }
});

test("a failed handler keeps evidence and is retried immediately", async () => {
  const { db, pglite } = await fixture();

  try {
    await claim(db);
    await failPaymentEvent(db, "evt_1", "database unavailable");

    const row = await db
      .prepare("SELECT status, last_error FROM billing_events")
      .get();

    assert.equal(row.status, "failed");
    assert.match(row.last_error, /database unavailable/);

    const retry = await claim(db, { now: NOW_MS + 1 });

    assert.equal(retry.ok, true);
    assert.equal(retry.attempt, 2);

    const cleared = await db
      .prepare("SELECT last_error FROM billing_events")
      .get();

    assert.equal(cleared.last_error, null);
  } finally {
    await pglite.close();
  }
});

test("a quarantined event is never reclaimed", async () => {
  const { db, pglite } = await fixture();

  try {
    await claim(db);
    await quarantinePaymentEvent(db, "evt_1", "amount mismatch");

    assert.deepEqual(await claim(db, { now: STALE_MS }), {
      ok: false,
      reason: "quarantined",
    });

    const row = await db.prepare("SELECT status FROM billing_events").get();

    assert.equal(row.status, "quarantined");
  } finally {
    await pglite.close();
  }
});

test("the configured environment binds accepted events", async () => {
  const { db, pglite } = await fixture();

  try {
    const mismatch = await claim(db, { livemode: false, expectedLivemode: true });

    assert.deepEqual(mismatch, {
      ok: false,
      reason: "environment_mismatch",
    });

    const quarantined = await db
      .prepare("SELECT status FROM billing_events")
      .get();

    assert.equal(quarantined.status, "quarantined");

    const matching = await claim(db, {
      id: "evt_2",
      livemode: true,
      expectedLivemode: true,
    });

    assert.equal(matching.ok, true);
  } finally {
    await pglite.close();
  }
});

test("an undeclared environment records the mode without enforcing it", async () => {
  const { db, pglite } = await fixture();

  try {
    const outcome = await claim(db, { livemode: false, expectedLivemode: null });

    assert.equal(outcome.ok, true);

    const row = await db.prepare("SELECT livemode FROM billing_events").get();

    assert.equal(Number(row.livemode), 0);
  } finally {
    await pglite.close();
  }
});

test("the operator view lists durable state", async () => {
  const { db, pglite } = await fixture();

  try {
    await claim(db);
    await completePaymentEvent(db, "evt_1", "2026-10-30T12:00:01.000Z");

    const rows = await listPaymentEvents(db);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "processed");
    assert.equal(Number(rows[0].attempts), 1);
  } finally {
    await pglite.close();
  }
});
