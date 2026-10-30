import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { settlementSchema } from "../lib/schema/settlements.ts";
import {
  commitSettlement,
  listQuarantinedHolds,
  listSettlements,
  openSettlement,
  quarantineHold,
  quarantinedWeight,
  releaseQuarantinedHold,
  settlementStatus,
} from "../lib/settlement-ledger.ts";

const NOW = "2026-10-30T12:00:00.000Z";
const LATER = "2026-10-30T12:15:00.000Z";

function fixture() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, held_micros INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE subscription_periods (
      id TEXT PRIMARY KEY,
      weighted_tokens_held INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO users VALUES ('a', 500), ('b', 0);
    INSERT INTO subscription_periods VALUES ('period_a', 400);
  `);
  settlementSchema(db);

  return db;
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

test("a settlement admits once and commits once", () => {
  const db = fixture();

  try {
    assert.equal(admit(db), "stl_1");
    assert.equal(settlementStatus(db, "stl_1"), "admitted");
    assert.equal(commitSettlement(db, "stl_1", NOW), true);
    assert.equal(settlementStatus(db, "stl_1"), "committed");
    assert.equal(commitSettlement(db, "stl_1", LATER), false);
    assert.equal(listSettlements(db).length, 1);
  } finally {
    db.close();
  }
});

test("an unknown settlement cannot be claimed", () => {
  const db = fixture();

  try {
    assert.equal(commitSettlement(db, "stl_missing", NOW), false);
  } finally {
    db.close();
  }
});

test("quarantine keeps credit reserved until an audited release", () => {
  const db = fixture();

  try {
    admit(db);
    const quarantined = quarantineHold(db, {
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
    assert.equal(settlementStatus(db, "stl_1"), "quarantined");
    assert.equal(
      db.prepare("SELECT held_micros FROM users WHERE id = 'a'").get()
        .held_micros,
      500,
      "expiry must not refund the reservation",
    );
    assert.equal(commitSettlement(db, "stl_1", LATER), false);

    assert.equal(
      releaseQuarantinedHold(db, { id: "hold_1", releasedAt: LATER }),
      true,
    );
    assert.equal(
      db.prepare("SELECT held_micros FROM users WHERE id = 'a'").get()
        .held_micros,
      353,
    );
    assert.equal(
      releaseQuarantinedHold(db, { id: "hold_1", releasedAt: LATER }),
      false,
      "a release happens once",
    );
    assert.equal(listQuarantinedHolds(db)[0].status, "released");
  } finally {
    db.close();
  }
});

test("subscription and free quarantine hold their own capacity", () => {
  const db = fixture();

  try {
    admit(db, {
      id: "stl_2",
      billingSource: "subscription",
      creditHoldId: null,
      subscriptionHoldId: "subhold_1",
    });
    quarantineHold(db, {
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

    assert.equal(settlementStatus(db, "stl_2"), "quarantined");
    assert.equal(
      db
        .prepare("SELECT weighted_tokens_held FROM subscription_periods")
        .get().weighted_tokens_held,
      400,
    );
    releaseQuarantinedHold(db, { id: "subhold_1", releasedAt: LATER });
    assert.equal(
      db
        .prepare("SELECT weighted_tokens_held FROM subscription_periods")
        .get().weighted_tokens_held,
      0,
    );

    quarantineHold(db, {
      id: "free_1",
      kind: "free",
      userId: "a",
      keyId: "key_a",
      modelId: "model",
      reserved: 90,
      createdAt: NOW,
      expiredAt: LATER,
    });

    assert.equal(quarantinedWeight(db, "a", "free"), 90);
    releaseQuarantinedHold(db, { id: "free_1", releasedAt: LATER });
    assert.equal(quarantinedWeight(db, "a", "free"), 0);
  } finally {
    db.close();
  }
});

test("quarantine is idempotent for the same reservation", () => {
  const db = fixture();
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
    assert.equal(quarantineHold(db, row), true);
    assert.equal(quarantineHold(db, row), false);
    assert.equal(listQuarantinedHolds(db).length, 1);
  } finally {
    db.close();
  }
});
