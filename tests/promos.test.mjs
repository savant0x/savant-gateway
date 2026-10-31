import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import {
  createPromoCode,
  listPromoCodes,
  redeemPromoCode,
  setPromoCodeStatus,
} from "../lib/promo-ledger.ts";
import {
  generatePromoCode,
  normalizePromoCode,
  promoCodeHash,
  readPromoPolicy,
} from "../lib/promo-codes.ts";
import { activitySchema } from "../lib/schema/activity.ts";
import { promoSchema } from "../lib/schema/promos.ts";

const NOW = "2026-10-31T12:00:00.000Z";
const LATER = "2026-11-01T12:00:00.000Z";

function fixture() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      credit_micros INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE credit_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      amount_micros INTEGER NOT NULL,
      balance_after_micros INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      reference TEXT
    );
    CREATE UNIQUE INDEX credit_ledger_reference_idx
      ON credit_ledger(reference) WHERE reference IS NOT NULL;
    INSERT INTO users VALUES ('cust_1', 'one@example.test', 1000000);
    INSERT INTO users VALUES ('cust_2', 'two@example.test', 0);
    INSERT INTO users VALUES ('cust_3', 'three@example.test', 0);
  `);
  activitySchema(db);
  promoSchema(db);

  return db;
}

function create(db, overrides = {}) {
  return createPromoCode(db, {
    amountMicros: 5_000_000,
    maxRedemptions: 2,
    label: "Launch credit",
    now: NOW,
    ...overrides,
  });
}

test("the promo lane is off unless the flag is explicitly true", () => {
  assert.equal(readPromoPolicy({}).enabled, false);
  assert.equal(readPromoPolicy({ PROMO_CODES_ENABLED: "false" }).enabled, false);
  assert.equal(readPromoPolicy({ PROMO_CODES_ENABLED: "1" }).enabled, false);
  assert.equal(readPromoPolicy({ PROMO_CODES_ENABLED: "true" }).enabled, true);
  assert.equal(readPromoPolicy({ PROMO_CODES_ENABLED: " TRUE " }).enabled, true);
});

test("a code is normalized, hashed at rest, and shown once", () => {
  const db = fixture();

  try {
    const generated = generatePromoCode(() => Buffer.alloc(12, 0));
    const normalized = normalizePromoCode(" abcd-efgh-jklm ");

    assert.equal(normalized, "ABCD-EFGH-JKLM");
    assert.equal(normalizePromoCode("ABCD-EFGH-JKL0"), null);
    assert.equal(normalizePromoCode("ABCD-EFGH-JKL!"), null);
    assert.equal(normalized && promoCodeHash(normalized).length, 64);
    assert.match(generated, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const created = create(db, { code: "ABCD-EFGH-JKLM" });

    assert.equal(created.ok, true);
    assert.equal(created.code, "ABCD-EFGH-JKLM");

    const row = db
      .prepare("SELECT code_hash, code_prefix FROM promo_codes")
      .get();

    assert.equal(row.code_hash, promoCodeHash("ABCD-EFGH-JKLM"));
    assert.notEqual(row.code_hash, "ABCD-EFGH-JKLM");
    assert.equal(row.code_prefix, "ABCD-EFGH");
    assert.equal(listPromoCodes(db).length, 1);
    assert.equal(
      JSON.stringify(listPromoCodes(db)).includes("ABCD-EFGH-JKLM"),
      false,
      "the list endpoint must not reveal the plaintext",
    );
  } finally {
    db.close();
  }
});

test("a valid code credits the ledger once and refuses a repeat", () => {
  const db = fixture();

  try {
    const created = create(db, { code: "ABCD-EFGH-JKLM" });

    assert.equal(created.ok, true);

    const first = redeemPromoCode(db, {
      userId: "cust_1",
      code: "abcd efgh jklm",
      enabled: true,
      now: NOW,
    });

    assert.equal(first.ok, true);
    assert.equal(first.amountMicros, 5_000_000);
    assert.equal(first.balanceAfter, 6_000_000);
    assert.equal(
      db.prepare("SELECT credit_micros FROM users WHERE id = 'cust_1'").get()
        .credit_micros,
      6_000_000,
    );

    const ledger = db
      .prepare("SELECT kind, amount_micros, reference FROM credit_ledger")
      .get();

    assert.equal(ledger.kind, "promo");
    assert.equal(ledger.amount_micros, 5_000_000);
    assert.match(ledger.reference, /^promo:promo_/);

    const repeat = redeemPromoCode(db, {
      userId: "cust_1",
      code: "ABCD-EFGH-JKLM",
      enabled: true,
      now: LATER,
    });

    assert.deepEqual(repeat, { ok: false, reason: "already_redeemed" });
    assert.equal(
      db.prepare("SELECT credit_micros FROM users WHERE id = 'cust_1'").get()
        .credit_micros,
      6_000_000,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM promo_redemptions").get().n,
      1,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM credit_ledger").get().n,
      1,
    );

    const activity = db
      .prepare(
        "SELECT kind, metadata FROM activity_events WHERE kind = 'promo.redeemed'",
      )
      .get();

    assert.equal(activity.kind, "promo.redeemed");
    assert.equal(JSON.parse(activity.metadata).amountMicros, 5_000_000);
    assert.equal(JSON.parse(activity.metadata).codePrefix, "ABCD-EFGH");
  } finally {
    db.close();
  }
});

test("the redemption cap holds across distinct customers", () => {
  const db = fixture();

  try {
    create(db, { code: "ABCD-EFGH-JKLM", maxRedemptions: 2 });

    assert.equal(
      redeemPromoCode(db, {
        userId: "cust_1",
        code: "ABCD-EFGH-JKLM",
        enabled: true,
        now: NOW,
      }).ok,
      true,
    );
    assert.equal(
      redeemPromoCode(db, {
        userId: "cust_2",
        code: "ABCD-EFGH-JKLM",
        enabled: true,
        now: NOW,
      }).ok,
      true,
    );

    const third = redeemPromoCode(db, {
      userId: "cust_3",
      code: "ABCD-EFGH-JKLM",
      enabled: true,
      now: NOW,
    });

    assert.deepEqual(third, { ok: false, reason: "exhausted" });
    assert.equal(
      db.prepare("SELECT redeemed_count FROM promo_codes").get().redeemed_count,
      2,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM promo_redemptions").get().n,
      2,
    );
  } finally {
    db.close();
  }
});

test("a paused, not-started, expired, or disabled code grants nothing", () => {
  const db = fixture();

  try {
    create(db, {
      code: "ABCD-EFGH-JKLM",
      startsAt: "2026-12-01T00:00:00.000Z",
    });
    const id = listPromoCodes(db)[0].id;

    assert.deepEqual(
      redeemPromoCode(db, {
        userId: "cust_1",
        code: "ABCD-EFGH-JKLM",
        enabled: true,
        now: NOW,
      }),
      { ok: false, reason: "not_started" },
    );

    setPromoCodeStatus(db, id, "paused");

    assert.deepEqual(
      redeemPromoCode(db, {
        userId: "cust_1",
        code: "ABCD-EFGH-JKLM",
        enabled: true,
        now: NOW,
      }),
      { ok: false, reason: "inactive" },
    );

    setPromoCodeStatus(db, id, "active");

    assert.deepEqual(
      redeemPromoCode(db, {
        userId: "cust_1",
        code: "ABCD-EFGH-JKLM",
        enabled: false,
        now: NOW,
      }),
      { ok: false, reason: "disabled" },
    );

    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM promo_redemptions").get().n,
      0,
    );
    db.prepare("UPDATE promo_codes SET starts_at = NULL").run();
    db.prepare("UPDATE promo_codes SET expires_at = ?").run(
      "2026-10-31T11:00:00.000Z",
    );

    assert.deepEqual(
      redeemPromoCode(db, {
        userId: "cust_1",
        code: "ABCD-EFGH-JKLM",
        enabled: true,
        now: NOW,
      }),
      { ok: false, reason: "expired" },
    );
  } finally {
    db.close();
  }
});

test("creation rejects invalid amounts, caps, windows, and duplicate codes", () => {
  const db = fixture();

  try {
    assert.deepEqual(create(db, { amountMicros: 0 }), {
      ok: false,
      error: "invalid_amount",
    });
    assert.deepEqual(create(db, { amountMicros: 500_000_001 }), {
      ok: false,
      error: "invalid_amount",
    });
    assert.deepEqual(create(db, { maxRedemptions: 0 }), {
      ok: false,
      error: "invalid_redemptions",
    });
    assert.deepEqual(
      create(db, {
        code: "ABCD-EFGH-JKLM",
        expiresAt: "2026-10-30T00:00:00.000Z",
      }),
      { ok: false, error: "invalid_window" },
    );
    assert.deepEqual(create(db, { code: "not-a-code" }), {
      ok: false,
      error: "invalid_code",
    });

    assert.equal(create(db, { code: "ABCD-EFGH-JKLM" }).ok, true);
    assert.deepEqual(create(db, { code: "abcd-efgh-jklm" }), {
      ok: false,
      error: "code_exists",
    });
  } finally {
    db.close();
  }
});
