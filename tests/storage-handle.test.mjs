import assert from "node:assert/strict";
import test from "node:test";

import {
  createStorageDatabase,
  resolveStorageMode,
} from "../lib/storage/database.ts";
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

/**
 * The runtime handle, checked against a real PostgreSQL engine.
 *
 * The point of these tests is not the credit arithmetic — `credit-reserve-
 * postgres.test.mjs` already covers that. It is that the *entry point the
 * application will use* reaches a migrated database and a working ledger, and
 * that its mode selection cannot quietly put a production deployment on the
 * single-process local engine.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({
    env: {},
    pool,
    // A pool handed in by a caller is not migrated by `createStorageDatabase`
    // only when this is set, so leaving it unset is exactly the production
    // path: create the handle, then migrate it.
  });

  return { db, pool };
}

/**
 * A user plus one key. The key is not decoration: `credit_holds.api_key_id` is
 * a foreign key, so a reservation against a user with no key is refused by
 * PostgreSQL before the balance is ever considered.
 */
async function seedUser(db, id, creditMicros) {
  const now = new Date(NOW).toISOString();

  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at, credit_micros, held_micros)
       VALUES (?, ?, ?, 'active', ?, ?, 0)`,
    )
    .run(id, `${id}@example.test`, id, now, creditMicros);

  await db
    .prepare(
      `INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, status, created_at)
       VALUES ('key_1', ?, 'Test key', 'sk_test', ?, 'active', ?)`,
    )
    .run(id, `hash_${id}`, now);
}

test("mode is postgres only when DATABASE_URL is set", () => {
  assert.equal(resolveStorageMode({}), "local");
  assert.equal(resolveStorageMode({ DATABASE_URL: "" }), "local");
  assert.equal(resolveStorageMode({ DATABASE_URL: "   " }), "local");
  assert.equal(
    resolveStorageMode({ DATABASE_URL: "postgres://u:p@host/db" }),
    "postgres",
  );
});

test("the handle migrates before it serves a query", async () => {
  const { db } = await fixture();

  const row = await db
    .prepare(
      "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_name = 'settlements'",
    )
    .get();

  assert.equal(Number(row.total), 1);

  // A ported table and a ported column are both present, so the migration is
  // the whole schema rather than the first module that happened to run.
  const column = await db
    .prepare(
      "SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'held_micros'",
    )
    .get();

  assert.equal(Number(column.total), 1);
});

test("migrating an already-migrated database changes nothing", async () => {
  const { db } = await fixture();
  await seedUser(db, "a", 1_000);

  const before = await db.prepare("SELECT COUNT(*) AS total FROM users").get();

  await migrateDatabase(db);

  const after = await db.prepare("SELECT COUNT(*) AS total FROM users").get();

  // Compared to itself, not to a remembered total: the migration seeds the
  // developer account outside production, so the absolute count is a property
  // of the environment. Running the migration again must change no row.
  assert.equal(Number(after.total), Number(before.total));
  assert.equal(Number(before.total), 2, "the seeded account plus the fixture");
});

test("a reservation round trip runs through the runtime handle", async () => {
  const { db } = await fixture();
  await seedUser(db, "a", 1_000);

  const hold = await reserveCredit(db, {
    userId: "a",
    keyId: "key_1",
    modelId: "model_1",
    holdMicros: 400,
    now: NOW,
  });

  assert.ok(hold);

  const reserved = await availableCredit(db, "a");

  assert.deepEqual(reserved, {
    creditMicros: 1_000,
    heldMicros: 400,
    availableMicros: 600,
  });

  // A reservation moves `held_micros` and never `credit_micros`: only
  // settlement does, which is what keeps an abandoned hold from becoming a
  // free charge or a refund.
  assert.equal(reserved.creditMicros, 1_000);

  assert.equal(await releaseHold(db, { holdId: hold.id, userId: "a" }), true);
  assert.equal(
    (await availableCredit(db, "a")).availableMicros,
    1_000,
    "a released hold returns exactly the reserved amount",
  );
});

test("a reservation over the available balance is refused, not clamped", async () => {
  const { db } = await fixture();
  await seedUser(db, "a", 100);

  const hold = await reserveCredit(db, {
    userId: "a",
    keyId: "key_1",
    modelId: "model_1",
    holdMicros: 400,
    now: NOW,
  });

  assert.equal(hold, null);
  assert.deepEqual(await availableCredit(db, "a"), {
    creditMicros: 100,
    heldMicros: 0,
    availableMicros: 100,
  });
});

test("an expired hold moves to quarantine and stays reserved", async () => {
  const { db } = await fixture();
  await seedUser(db, "a", 1_000);

  const hold = await reserveCredit(db, {
    userId: "a",
    keyId: "key_1",
    modelId: "model_1",
    holdMicros: 400,
    now: NOW,
  });

  assert.ok(hold);

  const quarantined = await quarantineExpiredHolds(db, {
    userId: "a",
    now: NOW + 16 * 60 * 1000,
  });

  assert.equal(quarantined, 400);

  const after = await availableCredit(db, "a");

  assert.equal(
    after.heldMicros,
    400,
    "quarantine keeps the hold: an elapsed window is not evidence that no upstream work happened",
  );

  const row = await db
    .prepare(
      "SELECT reserved, status FROM quarantined_holds WHERE id = ?",
    )
    .get(hold.id);

  assert.equal(Number(row.reserved), 400);
  assert.equal(row.status, "quarantined");
});

test("a handle built without an injected pool uses the local engine", async () => {
  const db = await createStorageDatabase({ env: {}, localDirectory: undefined });

  try {
    // Outside production the migration seeds the local developer account, so
    // a fresh local database is empty of customers but not empty of rows. The
    // seed is skipped when NODE_ENV is production.
    const users = await db.prepare("SELECT id FROM users").all();

    assert.deepEqual(
      users.map((user) => user.id),
      ["user_dev"],
      "a fresh local database holds only the seeded developer account",
    );

    // The same handle is a real PostgreSQL engine, so a ported statement with
    // PostgreSQL-only syntax has to work on it.
    const scalar = await db.prepare("SELECT GREATEST(0, -5) AS value").get();

    assert.equal(Number(scalar.value), 0);
  } finally {
    await db.close();
  }
});

test("an injected pool becomes the handle's only connection", async () => {
  const { pool } = await createPgliteDatabase();
  const db = createPostgresDatabase({ pool });

  await migrateDatabase(db);

  const seen = [];
  const tracking = {
    query(sql, values) {
      seen.push(sql.slice(0, 40));

      return pool.query(sql, values);
    },
    connect: () => pool.connect(),
    end: () => pool.end(),
  };

  const second = await createStorageDatabase({
    env: {},
    pool: tracking,
    poolIsInjected: true,
  });

  await second.prepare("SELECT 1 AS ok").get();

  assert.ok(
    seen.some((text) => text.includes("SELECT 1 AS ok")),
    "the injected pool is the handle's connection, not a new one",
  );
});
