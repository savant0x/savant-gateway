import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  createPromoCode,
  listPromoCodes,
  redeemPromoCode,
  setPromoCodeStatus,
} from "../lib/storage/store/promos.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-31T12:00:00.000Z";
const LATER = "2026-12-31T12:00:00.000Z";
const PAST = "2026-09-30T12:00:00.000Z";
const CODE = "ABCD-EFGH-JKLM";
const OPENING = 1_000_000;
const AMOUNT = 5_000_000;

/**
 * Promo codes on the target engine (FID-086, Batch B).
 *
 * A promo adds free money to a prepaid balance, so the suite tests the guards
 * rather than the happy path alone: a customer cannot redeem twice, the last
 * redemption slot cannot be sold twice, a paused or expired code grants
 * nothing, and the credited balance always matches the ledger row written with
 * it — including when the account already had credit.
 */

async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  for (const [id, email] of [
    ["u1", "u1@example.test"],
    ["u2", "u2@example.test"],
    ["u3", "u3@example.test"],
  ]) {
    await db
      .prepare(
        `INSERT INTO users (id, email, name, status, created_at, credit_micros)
         VALUES (?, ?, 'Customer', 'active', ?, ?)`,
      )
      .run(id, email, NOW, OPENING);
  }

  return db;
}

function create(db, overrides = {}) {
  return createPromoCode(db, {
    amountMicros: AMOUNT,
    maxRedemptions: 2,
    code: CODE,
    now: NOW,
    ...overrides,
  });
}

function redeem(db, userId, now = NOW, overrides = {}) {
  return redeemPromoCode(db, {
    userId,
    code: CODE,
    enabled: true,
    now,
    ...overrides,
  });
}

test("a promo is created once with a hashed code and a visible prefix", async () => {
  const db = await fixture();

  try {
    const created = await create(db);

    assert.equal(created.ok, true);
    assert.equal(created.code, CODE);
    assert.equal(created.promo.codePrefix, "ABCD-EFGH");
    assert.equal(created.promo.redeemedCount, 0);
    assert.equal(created.promo.status, "active");

    const rows = await db.prepare("SELECT code_hash FROM promo_codes").all();

    assert.equal(rows.length, 1);
    assert.notEqual(
      rows[0].code_hash,
      CODE,
      "the plaintext code is never stored",
    );

    const listed = await listPromoCodes(db);

    assert.equal(listed.length, 1);
    assert.equal(listed[0].amountMicros, AMOUNT);
    assert.equal(listed[0].maxRedemptions, 2);

    const duplicate = await create(db);

    assert.deepEqual(duplicate, { ok: false, error: "code_exists" });
  } finally {
    await db.close();
  }
});

test("invalid amounts, slots, windows and codes are refused before any write", async () => {
  const db = await fixture();

  try {
    assert.deepEqual(await create(db, { amountMicros: 0 }), {
      ok: false,
      error: "invalid_amount",
    });
    assert.deepEqual(await create(db, { maxRedemptions: 0 }), {
      ok: false,
      error: "invalid_redemptions",
    });
    assert.deepEqual(await create(db, { expiresAt: PAST }), {
      ok: false,
      error: "invalid_window",
    });
    assert.deepEqual(await create(db, { code: "ABCD-EFGH-JKLI" }), {
      ok: false,
      error: "invalid_code",
    });

    const count = await db
      .prepare("SELECT COUNT(*) AS n FROM promo_codes")
      .get();

    assert.equal(Number(count.n), 0);
  } finally {
    await db.close();
  }
});

test("a redemption credits the balance, the ledger and the activity log", async () => {
  const db = await fixture();

  try {
    await create(db);

    const result = await redeemPromoCode(db, {
      userId: "u1",
      code: CODE.toLowerCase(),
      enabled: true,
      now: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.amountMicros, AMOUNT);
    assert.equal(
      result.balanceAfter,
      OPENING + AMOUNT,
      "an existing balance is added to, not replaced",
    );

    const user = await db
      .prepare("SELECT credit_micros FROM users WHERE id = 'u1'")
      .get();

    assert.equal(Number(user.credit_micros), OPENING + AMOUNT);

    const ledger = await db
      .prepare("SELECT * FROM credit_ledger WHERE user_id = 'u1'")
      .all();

    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].kind, "promo");
    assert.equal(Number(ledger[0].amount_micros), AMOUNT);
    assert.equal(Number(ledger[0].balance_after_micros), OPENING + AMOUNT);

    const activity = await db
      .prepare("SELECT kind FROM activity_events WHERE user_id = 'u1'")
      .all();

    assert.deepEqual(
      activity.map((row) => row.kind),
      ["promo.redeemed"],
    );

    const promo = await db
      .prepare("SELECT redeemed_count FROM promo_codes")
      .get();

    assert.equal(Number(promo.redeemed_count), 1);
  } finally {
    await db.close();
  }
});

test("a customer cannot redeem the same code twice", async () => {
  const db = await fixture();

  try {
    await create(db);
    await redeemPromoCode(db, { userId: "u1", code: CODE, enabled: true, now: NOW });

    const again = await redeemPromoCode(db, {
      userId: "u1",
      code: CODE,
      enabled: true,
      now: NOW,
    });

    assert.deepEqual(again, { ok: false, reason: "already_redeemed" });

    const user = await db
      .prepare("SELECT credit_micros FROM users WHERE id = 'u1'")
      .get();

    assert.equal(
      Number(user.credit_micros),
      OPENING + AMOUNT,
      "a second submission grants nothing",
    );
  } finally {
    await db.close();
  }
});

test("the last available slot cannot be sold twice", async () => {
  const db = await fixture();

  try {
    await create(db, { maxRedemptions: 2 });

    assert.equal(
      (await redeemPromoCode(db, { userId: "u1", code: CODE, enabled: true, now: NOW })).ok,
      true,
    );
    assert.equal(
      (await redeemPromoCode(db, { userId: "u2", code: CODE, enabled: true, now: NOW })).ok,
      true,
    );

    const third = await redeemPromoCode(db, {
      userId: "u3",
      code: CODE,
      enabled: true,
      now: NOW,
    });

    assert.deepEqual(third, { ok: false, reason: "exhausted" });

    const untouched = await db
      .prepare("SELECT credit_micros FROM users WHERE id = 'u3'")
      .get();

    assert.equal(Number(untouched.credit_micros), OPENING);
  } finally {
    await db.close();
  }
});

test("a code that is early or expired grants nothing", async () => {
  const db = await fixture();

  try {
    await create(db, { startsAt: LATER, maxRedemptions: 5 });

    assert.deepEqual(await redeem(db, "u1", NOW), {
      ok: false,
      reason: "not_started",
    });

    const granted = await redeem(db, "u1", LATER);

    assert.equal(granted.ok, true);
    assert.equal(granted.balanceAfter, OPENING + AMOUNT);

    await create(db, {
      code: "mnpq-rstu-vwxy",
      expiresAt: "2027-01-01T00:00:00.000Z",
      maxRedemptions: 5,
    });

    assert.deepEqual(
      await redeem(db, "u2", "2027-01-01T00:00:00.000Z", {
        code: "MNPQ-RSTU-VWXY",
      }),
      { ok: false, reason: "expired" },
    );
  } finally {
    await db.close();
  }
});

test("a disabled policy, unknown customer and paused code are refused", async () => {
  const db = await fixture();

  try {
    await create(db);

    assert.deepEqual(
      await redeemPromoCode(db, { userId: "u1", code: CODE, enabled: false }),
      { ok: false, reason: "disabled" },
    );
    assert.deepEqual(
      await redeemPromoCode(db, { userId: "nobody", code: CODE, enabled: true, now: NOW }),
      { ok: false, reason: "unknown_user" },
    );
    assert.deepEqual(
      await redeemPromoCode(db, { userId: "u1", code: "not-a-code", enabled: true, now: NOW }),
      { ok: false, reason: "invalid_code" },
    );

    const [promo] = await listPromoCodes(db);

    assert.equal(await setPromoCodeStatus(db, promo.id, "paused"), "updated");
    assert.equal(await setPromoCodeStatus(db, promo.id, "paused"), "unchanged");
    assert.equal(await setPromoCodeStatus(db, "promo_missing", "paused"), "missing");

    assert.deepEqual(
      await redeemPromoCode(db, { userId: "u1", code: CODE, enabled: true, now: NOW }),
      { ok: false, reason: "inactive" },
    );
  } finally {
    await db.close();
  }
});
