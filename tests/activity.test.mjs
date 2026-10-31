import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import {
  ACTIVITY_KINDS,
  insertActivity,
  insertActivityBestEffort,
  queryActivity,
  sanitizeActivityMetadata,
} from "../lib/activity.ts";
import { activitySchema } from "../lib/schema/activity.ts";

function fixture() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE
    );
    INSERT INTO users VALUES ('cust_1', 'one@example.test');
    INSERT INTO users VALUES ('cust_2', 'two@example.test');
  `);
  activitySchema(db);

  return db;
}

test("activity events are appended and read newest first with bounded limits", () => {
  const db = fixture();

  try {
    insertActivity(db, {
      userId: "cust_1",
      actor: "customer",
      kind: "customer.signup",
      entityType: "customer",
      entityId: "cust_1",
      now: "2026-10-31T10:00:00.000Z",
    });
    insertActivity(db, {
      userId: "cust_1",
      actor: "admin",
      kind: "credit.granted",
      entityType: "credit",
      entityId: "cust_1",
      metadata: { amountMicros: 500_000, source: "grant" },
      now: "2026-10-31T11:00:00.000Z",
    });
    insertActivity(db, {
      userId: "cust_2",
      actor: "system",
      kind: "topup.paid",
      entityType: "topup",
      entityId: "topup_1",
      metadata: { topupId: "topup_1", amountMicros: 1_000_000 },
      now: "2026-10-31T12:00:00.000Z",
    });

    const all = queryActivity(db, 100);

    assert.equal(all.length, 3);
    assert.equal(all[0].kind, "topup.paid");
    assert.equal(all[0].userEmail, "two@example.test");
    assert.deepEqual(all[0].metadata, {
      topupId: "topup_1",
      amountMicros: 1_000_000,
    });

    assert.equal(queryActivity(db, 2).length, 2);
    assert.equal(queryActivity(db, 0).length, 1, "limit is clamped to 1");
    assert.equal(
      queryActivity(db, 500).length,
      3,
      "limit is capped at 100 but returns all available rows",
    );

    const customerEvents = queryActivity(db, 10, { userId: "cust_1" });

    assert.equal(customerEvents.length, 2);
    assert.equal(customerEvents[0].kind, "credit.granted");

    const paid = queryActivity(db, 10, { kind: "topup.paid" });

    assert.equal(paid.length, 1);
    assert.equal(paid[0].userId, "cust_2");
  } finally {
    db.close();
  }
});

test("metadata rejects unknown keys, secret-shaped keys, and non-scalars", () => {
  assert.throws(
    () => sanitizeActivityMetadata({ unknownKey: "value" }),
    /not allowed/,
  );
  assert.throws(
    () => sanitizeActivityMetadata({ token: "secret" }),
    /not allowed/,
  );
  assert.throws(
    () => sanitizeActivityMetadata({ amountMicros: Number.NaN }),
    /scalar/,
  );
  assert.throws(
    () => sanitizeActivityMetadata({ status: { nested: true } }),
    /scalar/,
  );
  assert.throws(
    () => sanitizeActivityMetadata({ status: "x".repeat(201) }),
    /too long/,
  );
  assert.equal(
    sanitizeActivityMetadata({ amountMicros: 12, status: "paid" }),
    "{\"amountMicros\":12,\"status\":\"paid\"}",
  );
});

test("a failed best-effort insert leaves no partial row", () => {
  const db = fixture();

  try {
    const result = insertActivityBestEffort(db, {
      userId: "cust_1",
      actor: "customer",
      kind: "customer.login",
      entityType: "customer",
      metadata: { password: "must-not-be-stored" },
    });

    assert.equal(result, null);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM activity_events").get().n,
      0,
    );
  } finally {
    db.close();
  }
});

test("the declared activity vocabulary covers every emitted kind", () => {
  for (const kind of [
    "customer.signup",
    "customer.login",
    "customer.logout",
    "customer.key_created",
    "customer.key_revoked",
    "credit.granted",
    "credit.adjusted",
    "topup.created",
    "topup.paid",
    "promo.created",
    "promo.redeemed",
  ]) {
    assert.equal(
      ACTIVITY_KINDS.includes(kind),
      true,
      `${kind} is missing from ACTIVITY_KINDS`,
    );
  }
});
