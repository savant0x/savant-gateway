import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createPostgresDatabase } from "../lib/storage/pg-adapter.ts";
import {
  debitCredit,
  quarantineHold,
  releaseQuarantinedHold,
} from "../lib/storage/ledger/settlements.ts";
import { createPostgresPool } from "../lib/storage/pg-pool.ts";
import { migrateDatabase } from "../lib/storage/schema/index.ts";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();

/**
 * The double-spend proof this port exists for.
 *
 * PGlite — which the rest of the ledger suite uses — has a single connection,
 * so it can show that the guard rejects a second debit, but it cannot show two
 * clients racing. Proving that needs two real connections against one database.
 *
 * Without `TEST_DATABASE_URL` this test is **skipped, not passed**: the guard's
 * shape is covered in `tests/ledger-postgres.test.mjs`, and the race is proven
 * only here. The mandatory `npm run test:postgres` gate supplies a disposable
 * URL (or starts one) and fails rather than skipping when neither exists.
 *
 * The explicit TEST_ name keeps application `DATABASE_URL` from accidentally
 * aiming this destructive proof at a real database. The test migrates the
 * target and creates its own account, then deletes it, but it still must never
 * be pointed at production.
 */
test("two connections cannot debit one balance twice", async (context) => {
  if (!TEST_DATABASE_URL) {
    context.skip(
      "TEST_DATABASE_URL is not set — run npm run test:postgres for the mandatory two-connection proof",
    );

    return;
  }

  const first = createPostgresDatabase({
    pool: createPostgresPool({ connectionString: TEST_DATABASE_URL }),
  });
  const second = createPostgresDatabase({
    pool: createPostgresPool({ connectionString: TEST_DATABASE_URL }),
  });
  const userId = `concurrency_${randomUUID()}`;

  try {
    await migrateDatabase(first);

    await first
      .prepare(
        `INSERT INTO users (id, email, name, status, created_at, credit_micros)
         VALUES (?, ?, ?, 'active', ?, ?)`,
      )
      .run(
        userId,
        `${userId}@example.test`,
        "Concurrency Probe",
        new Date().toISOString(),
        100,
      );

    const outcomes = await Promise.all([
      first.transaction(async () => debitCredit(first, { userId, micros: 80 }))(),
      second.transaction(async () => debitCredit(second, { userId, micros: 80 }))(),
    ]);

    const accepted = outcomes.filter((outcome) => outcome.ok);
    const rejected = outcomes.filter((outcome) => !outcome.ok);

    assert.equal(accepted.length, 1, "exactly one debit may commit");
    assert.equal(rejected.length, 1, "the competing debit must be refused");
    assert.equal(rejected[0].reason, "insufficient_credit");

    const row = await first
      .prepare("SELECT credit_micros FROM users WHERE id = ?")
      .get(userId);

    assert.equal(
      Number(row.credit_micros),
      20,
      "the balance reflects one debit, not two",
    );
  } finally {
    await first
      .prepare("DELETE FROM users WHERE id = ?")
      .run(userId)
      .catch(() => undefined);
    await first.close();
    await second.close();
  }
});

test("two connections release one quarantine without releasing other holds", async (context) => {
  if (!TEST_DATABASE_URL) {
    context.skip("TEST_DATABASE_URL is required for the quarantine release race");

    return;
  }

  const suffix = randomUUID().slice(0, 8);
  const names = [`quarantine_${suffix}_a`, `quarantine_${suffix}_b`];
  const pools = names.map((applicationName) =>
    createPostgresPool({ connectionString: TEST_DATABASE_URL, applicationName }),
  );
  const first = createPostgresDatabase({ pool: pools[0] });
  const second = createPostgresDatabase({ pool: pools[1] });
  const userId = `release_${randomUUID()}`;
  const holdId = `hold_${randomUUID()}`;
  const now = new Date().toISOString();
  let blocker;
  let pending = [];

  try {
    await migrateDatabase(first);
    await first.prepare(
      `INSERT INTO users (id, email, name, status, created_at, credit_micros, held_micros)
       VALUES (?, ?, 'Release Probe', 'active', ?, 1000, 300)`,
    ).run(userId, `${userId}@example.test`, now);
    await quarantineHold(first, {
      id: holdId, kind: "credit", userId, keyId: null, modelId: null,
      reserved: 100, createdAt: now, expiredAt: now,
    });

    blocker = await pools[0].connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);

    pending = [first, second].map((db) =>
      releaseQuarantinedHold(db, { id: holdId, releasedAt: now }),
    );
    // Attach rejection handlers before polling so a database refusal cannot
    // become an unhandled rejection while the blocker is still held.
    const completed = Promise.allSettled(pending);
    const deadline = Date.now() + 8_000;
    let waiting = 0;

    while (Date.now() < deadline) {
      const rows = await first.query(
        `SELECT COUNT(*)::int AS total FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND (query LIKE '%held_micros%' OR query LIKE '%quarantined_holds%'
                 OR query LIKE '%FROM users%' OR query LIKE '%settlements%')`,
      );
      waiting = Number(rows[0].total);

      if (waiting === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.equal(waiting, 2, "both release transactions must contend before unblocking");
    await blocker.query("ROLLBACK");
    blocker.release();
    blocker = null;

    const results = await completed;
    assert.ok(results.every((result) => result.status === "fulfilled"));
    const accepted = results.filter((result) => result.value === true);
    assert.equal(accepted.length, 1, "one quarantine may be released only once");
    const row = await first.prepare("SELECT held_micros FROM users WHERE id = ?").get(userId);
    assert.equal(Number(row.held_micros), 200, "unrelated held credit stays reserved");
    assert.equal(
      await releaseQuarantinedHold(first, { id: holdId, releasedAt: now }),
      false,
    );
  } finally {
    if (blocker) {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
    await Promise.allSettled(pending);
    await first.prepare("DELETE FROM quarantined_holds WHERE id = ?").run(holdId);
    await first.prepare("DELETE FROM users WHERE id = ?").run(userId);
    await first.close();
    await second.close();
  }
});
