import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createPostgresDatabase } from "../lib/storage/pg-adapter.ts";
import { debitCredit } from "../lib/storage/ledger/settlements.ts";
import { createPostgresPool } from "../lib/storage/pg-pool.ts";
import { migrateDatabase } from "../lib/storage/schema/index.ts";

const DATABASE_URL = process.env.DATABASE_URL?.trim();

/**
 * The double-spend proof this port exists for.
 *
 * PGlite — which the rest of the ledger suite uses — has a single connection,
 * so it can show that the guard rejects a second debit, but it cannot show two
 * clients racing. Proving that needs two real connections against one database.
 *
 * Without `DATABASE_URL` this test is **skipped, not passed**: the guard's shape
 * is covered in `tests/ledger-postgres.test.mjs`, and the race is proven only
 * here. Point `DATABASE_URL` at a disposable database (a Neon Free project is
 * enough) and this runs for real.
 *
 * The test migrates the target and creates its own account, then deletes it, so
 * it is safe on a shared development database and must never be pointed at
 * production.
 */
test("two connections cannot debit one balance twice", async (context) => {
  if (!DATABASE_URL) {
    context.skip(
      "DATABASE_URL is not set — two-connection concurrency cannot be proven against PGlite's single connection",
    );

    return;
  }

  const first = createPostgresDatabase({
    pool: createPostgresPool({ connectionString: DATABASE_URL }),
  });
  const second = createPostgresDatabase({
    pool: createPostgresPool({ connectionString: DATABASE_URL }),
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
