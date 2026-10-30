import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { paymentEventSchema } from "../lib/schema/payments.ts";
import {
  CLAIM_GRACE_MS,
  claimPaymentEvent,
  completePaymentEvent,
  failPaymentEvent,
  listPaymentEvents,
  quarantinePaymentEvent,
} from "../lib/payment-events.ts";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const LATER = NOW + CLAIM_GRACE_MS + 1;

function fixture() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE billing_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      processed_at TEXT NOT NULL
    );
  `);
  paymentEventSchema(db);

  return db;
}

function claim(db, overrides = {}) {
  return claimPaymentEvent(db, {
    id: "evt_1",
    type: "checkout.session.completed",
    livemode: true,
    expectedLivemode: null,
    now: NOW,
    ...overrides,
  });
}

test("an event is claimed once and answered as in-flight while recent", () => {
  const db = fixture();

  try {
    assert.deepEqual(claim(db), { ok: true, attempt: 1 });
    assert.deepEqual(claim(db), { ok: false, reason: "in_flight" });
    assert.equal(
      db.prepare("SELECT attempts FROM billing_events WHERE id = 'evt_1'").get()
        .attempts,
      1,
    );
  } finally {
    db.close();
  }
});

test("a stale claim can be retried after a crash", () => {
  const db = fixture();

  try {
    claim(db);
    const retry = claim(db, { now: LATER });

    assert.equal(retry.ok, true);
    assert.equal(retry.attempt, 2);
    assert.equal(
      db.prepare("SELECT status, attempts FROM billing_events").get().status,
      "claimed",
    );
  } finally {
    db.close();
  }
});

test("a processed event is terminal", () => {
  const db = fixture();

  try {
    claim(db);
    completePaymentEvent(db, "evt_1", "2026-10-30T12:00:01.000Z");
    assert.deepEqual(claim(db, { now: LATER }), {
      ok: false,
      reason: "processed",
    });
  } finally {
    db.close();
  }
});

test("a failed handler keeps evidence and is retried immediately", () => {
  const db = fixture();

  try {
    claim(db);
    failPaymentEvent(db, "evt_1", "database unavailable");

    const row = db.prepare("SELECT status, last_error FROM billing_events").get();

    assert.equal(row.status, "failed");
    assert.match(row.last_error, /database unavailable/);

    const retry = claim(db, { now: NOW + 1 });

    assert.equal(retry.ok, true);
    assert.equal(retry.attempt, 2);
    assert.equal(
      db.prepare("SELECT last_error FROM billing_events").get().last_error,
      null,
    );
  } finally {
    db.close();
  }
});

test("a quarantined event is never reclaimed", () => {
  const db = fixture();

  try {
    claim(db);
    quarantinePaymentEvent(db, "evt_1", "amount mismatch");
    assert.deepEqual(claim(db, { now: LATER }), {
      ok: false,
      reason: "quarantined",
    });
    assert.equal(
      db.prepare("SELECT status FROM billing_events").get().status,
      "quarantined",
    );
  } finally {
    db.close();
  }
});

test("the configured environment binds accepted events", () => {
  const db = fixture();

  try {
    const mismatch = claim(db, { livemode: false, expectedLivemode: true });

    assert.deepEqual(mismatch, { ok: false, reason: "environment_mismatch" });
    assert.equal(
      db.prepare("SELECT status FROM billing_events").get().status,
      "quarantined",
    );

    const matching = claim(db, {
      id: "evt_2",
      livemode: true,
      expectedLivemode: true,
    });

    assert.equal(matching.ok, true);
  } finally {
    db.close();
  }
});

test("an undeclared environment records the mode without enforcing it", () => {
  const db = fixture();

  try {
    const outcome = claim(db, { livemode: false, expectedLivemode: null });

    assert.equal(outcome.ok, true);
    assert.equal(
      db.prepare("SELECT livemode FROM billing_events").get().livemode,
      0,
    );
  } finally {
    db.close();
  }
});

test("the operator view lists durable state", () => {
  const db = fixture();

  try {
    claim(db);
    completePaymentEvent(db, "evt_1", "2026-10-30T12:00:01.000Z");
    const rows = listPaymentEvents(db);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "processed");
    assert.equal(rows[0].attempts, 1);
  } finally {
    db.close();
  }
});
