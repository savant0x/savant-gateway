import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresDatabase } from "../lib/storage/pg-adapter.ts";
import { migrateDatabase } from "../lib/storage/schema/index.ts";
import {
  availableCredit,
  quarantineExpiredHolds,
  releaseHold,
  reserveCredit,
} from "../lib/storage/store/credit.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const STAMP = "2026-10-30T12:00:00.000Z";

async function fixture(creditMicros = 100, heldMicros = 0) {
  const { pool, pglite } = await createPgliteDatabase();
  const db = createPostgresDatabase({ pool });

  await migrateDatabase(db);

  await db.exec(`
    INSERT INTO users (id, email, name, status, created_at, credit_micros, held_micros)
    VALUES ('a', 'a@example.test', 'Account A', 'active', '${STAMP}',
            ${creditMicros}, ${heldMicros});

    INSERT INTO api_keys
      (id, user_id, name, prefix, secret_hash, status, created_at)
    VALUES ('key_a', 'a', 'Primary', 'sk_a', 'hash_a', 'active', '${STAMP}');
  `);

  return { db, pglite };
}

function reserve(db, holdMicros = 60, overrides = {}) {
  return reserveCredit(db, {
    userId: "a",
    keyId: "key_a",
    modelId: "model",
    holdMicros,
    now: NOW,
    ...overrides,
  });
}

test("a reservation inside the available balance records a hold", async () => {
  const { db, pglite } = await fixture(100, 0);

  try {
    const hold = await reserve(db, 60);

    assert.ok(hold, "the hold is granted");
    assert.equal(hold.holdMicros, 60);

    const balance = await availableCredit(db, "a");

    assert.equal(balance.creditMicros, 100, "a hold never moves credit");
    assert.equal(balance.heldMicros, 60);
    assert.equal(balance.availableMicros, 40);

    const row = await db
      .prepare("SELECT hold_micros FROM credit_holds WHERE id = ?")
      .get(hold.id);

    assert.equal(Number(row.hold_micros), 60);
  } finally {
    await pglite.close();
  }
});

test("a reservation beyond the available balance is refused and writes nothing", async () => {
  const { db, pglite } = await fixture(100, 0);

  try {
    assert.equal(await reserve(db, 101), null);

    const balance = await availableCredit(db, "a");
    const holds = await db
      .prepare("SELECT COUNT(*)::int AS total FROM credit_holds")
      .get();

    assert.equal(balance.heldMicros, 0);
    assert.equal(Number(holds.total), 0);
  } finally {
    await pglite.close();
  }
});

test("a balance cannot be reserved twice past its available amount", async () => {
  const { db, pglite } = await fixture(100, 0);

  try {
    const first = await reserve(db, 60);
    const second = await reserve(db, 60);

    assert.ok(first, "the first reservation is granted");
    assert.equal(
      second,
      null,
      "the second must be refused: the guard is the WHERE clause, not a JS compare",
    );

    const balance = await availableCredit(db, "a");

    assert.equal(balance.heldMicros, 60, "only one hold is recorded");
    assert.equal(balance.availableMicros, 40);

    const holds = await db
      .prepare("SELECT COUNT(*)::int AS total FROM credit_holds")
      .get();

    assert.equal(Number(holds.total), 1);
  } finally {
    await pglite.close();
  }
});

test("available credit still excludes an existing hold", async () => {
  const { db, pglite } = await fixture(100, 90);

  try {
    assert.equal(
      await reserve(db, 20),
      null,
      "100 credit against 90 held leaves 10 available",
    );

    const hold = await reserve(db, 10);

    assert.ok(hold);
    assert.equal((await availableCredit(db, "a")).availableMicros, 0);
  } finally {
    await pglite.close();
  }
});

test("a release frees exactly the hold and happens once", async () => {
  const { db, pglite } = await fixture(100, 0);

  try {
    const hold = await reserve(db, 60);

    assert.equal(await releaseHold(db, { holdId: hold.id, userId: "a" }), true);

    const released = await availableCredit(db, "a");

    assert.equal(released.heldMicros, 0);
    assert.equal(released.availableMicros, 100);

    assert.equal(
      await releaseHold(db, { holdId: hold.id, userId: "a" }),
      false,
      "a second release must not decrement held_micros again",
    );
    assert.equal((await availableCredit(db, "a")).heldMicros, 0);
  } finally {
    await pglite.close();
  }
});

test("an expired hold quarantines and keeps its capacity reserved", async () => {
  const { db, pglite } = await fixture(100, 0);

  try {
    const hold = await reserve(db, 60, { ttlMs: 1000 });

    assert.ok(hold);

    assert.equal(
      await quarantineExpiredHolds(db, { userId: "a", now: NOW + 60_000 }),
      60,
    );

    const afterQuarantine = await availableCredit(db, "a");

    assert.equal(
      afterQuarantine.heldMicros,
      60,
      "expiry is not proof that nothing ran, so capacity stays reserved",
    );

    const holds = await db
      .prepare("SELECT COUNT(*)::int AS total FROM credit_holds")
      .get();
    const quarantined = await db
      .prepare("SELECT status FROM quarantined_holds WHERE id = ?")
      .get(hold.id);

    assert.equal(Number(holds.total), 0, "the live hold row is consumed");
    assert.equal(quarantined.status, "quarantined");
  } finally {
    await pglite.close();
  }
});

test("a hold that has not expired is left alone", async () => {
  const { db, pglite } = await fixture(100, 0);

  try {
    const hold = await reserve(db, 60, { ttlMs: 60 * 60 * 1000 });

    assert.equal(
      await quarantineExpiredHolds(db, { userId: "a", now: NOW + 1000 }),
      0,
    );

    const row = await db
      .prepare("SELECT COUNT(*)::int AS total FROM credit_holds WHERE id = ?")
      .get(hold.id);

    assert.equal(Number(row.total), 1);
    assert.equal((await availableCredit(db, "a")).heldMicros, 60);
  } finally {
    await pglite.close();
  }
});
