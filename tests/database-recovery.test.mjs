import assert from "node:assert/strict";
import test from "node:test";

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BackupRefused,
  dumpDatabase,
  readManifest,
  restoreDatabase,
} from "../lib/storage/backup.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import { availableCredit } from "../lib/storage/store/credit.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-31T00:00:00.000Z";
const EXPIRES = "2026-10-31T00:05:00.000Z";

/**
 * The recovery path on the engine that ships (FID-086 step 6).
 *
 * The properties under test are the ones a restore either has or does not: every
 * row present, the same rows rather than merely the same counts, a spendable
 * balance afterwards, and a refusal that leaves the target alone. A dump that
 * "restores" by dropping a table or accepting a tampered file would pass a
 * count-only check, which is why checksums and the ledger equation are both
 * asserted here.
 */
async function workspace() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  return db;
}

async function seed(db) {
  await db
    .prepare(
      `INSERT INTO users
        (id, email, name, status, created_at, credit_micros, held_micros)
       VALUES ('user_a', 'a@example.test', 'A', 'active', ?, 5000, 250),
              ('user_b', 'b@example.test', 'B', 'active', ?, 0, 0)`,
    )
    .run(NOW, NOW);

  await db
    .prepare(
      `INSERT INTO api_keys
        (id, user_id, name, prefix, secret_hash, status, created_at)
       VALUES ('key_a', ?, 'A', 'sg_a', 'sha256:a', 'active', ?)`,
    )
    .run("user_a", NOW);

  await db
    .prepare(
      `INSERT INTO credit_ledger
        (id, user_id, kind, amount_micros, balance_after_micros, note, created_at)
       VALUES ('ledger_1', ?, 'topup', 8000, 8000, 'top-up', ?),
              ('ledger_2', ?, 'usage', -3000, 5000, 'usage', ?)`,
    )
    .run("user_a", NOW, "user_a", NOW);

  await db
    .prepare(
      `INSERT INTO credit_holds
        (id, user_id, api_key_id, model_id, hold_micros, created_at, expires_at)
       VALUES ('hold_1', ?, 'key_a', 'model', 250, ?, ?)`,
    )
    .run("user_a", NOW, EXPIRES);

  await db
    .prepare(
      `INSERT INTO topups
        (id, user_id, provider, provider_ref, amount_micros, currency, status,
         created_at, paid_at)
       VALUES ('topup_1', ?, 'stripe', 'cs_1', 8000, 'usd', 'paid', ?, ?)`,
    )
    .run("user_a", NOW, NOW);

  await db
    .prepare(
      `INSERT INTO usage_events
        (id, user_id, api_key_id, model_id, charged_micros, status, created_at)
       VALUES ('usage_1', ?, 'key_a', 'model', 3000, 'ok', ?)`,
    )
    .run("user_a", NOW);

  await db
    .prepare(
      `INSERT INTO billing_events (id, type, processed_at)
       VALUES ('evt_1', 'checkout.session.completed', ?)`,
    )
    .run(NOW);
}

function tamper(directory, schema, table, predicate, change) {
  const path = join(directory, `${schema}.${table}.jsonl`);
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  const rewritten = lines.map((line) => {
    const row = JSON.parse(line);

    if (!predicate(row)) return line;

    change(row);

    return JSON.stringify(row);
  });

  writeFileSync(path, `${rewritten.join("\n")}\n`);
}

test("a dump restores every row, every checksum and a spendable balance", async () => {
  const directory = mkdtempSync(join(tmpdir(), "gateway-dump-"));
  const dumpDirectory = join(directory, "dump");
  const source = await workspace();
  const restored = await workspace();

  try {
    await seed(source);

    const { manifest } = await dumpDatabase(source, dumpDirectory);

    assert.equal(manifest.format, "savant-gateway-pg-dump/2");
    assert.equal(manifest.balance.mismatches, 0);
    assert.ok(
      manifest.tables.some(
        (entry) => entry.schema === "content" && entry.table === "sources",
      ),
      "the content schema is in the dump",
    );
    assert.ok(
      manifest.tables.some(
        (entry) => entry.schema === "identity" && entry.table === "protocols",
      ),
      "the identity schema is in the dump",
    );
    assert.equal(
      manifest.tables.find((entry) => entry.table === "users").rows,
      3,
      "two seeded customers and the development user",
    );
    assert.deepEqual(
      readManifest(dumpDirectory).tables.map((entry) => entry.table),
      manifest.tables.map((entry) => entry.table),
    );

    const receipt = await restoreDatabase(restored, dumpDirectory);

    assert.equal(receipt.balance.mismatches, 0);

    for (const entry of manifest.tables) {
      const restoredRows = receipt.tables.find(
        (row) => row.table === entry.table,
      );

      assert.equal(restoredRows.rows, entry.rows, entry.table);

      const counted = await restored
        .prepare(
          `SELECT COUNT(*) AS count FROM "${entry.schema}"."${entry.table}"`,
        )
        .get();

      assert.equal(Number(counted.count), entry.rows, entry.table);
    }

    const credit = await availableCredit(restored, "user_a");

    assert.equal(credit.creditMicros, 5000);
    assert.equal(credit.heldMicros, 250);
    assert.equal(credit.availableMicros, 4750);

    const ledger = await restored
      .prepare(
        `SELECT COALESCE(SUM(amount_micros), 0) AS total
           FROM credit_ledger WHERE user_id = ?`,
      )
      .get("user_a");

    assert.equal(Number(ledger.total), 5000);
  } finally {
    await source.close();
    await restored.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a tampered dump is refused and the target keeps its rows", async () => {
  const directory = mkdtempSync(join(tmpdir(), "gateway-dump-"));
  const dumpDirectory = join(directory, "dump");
  const tampered = join(directory, "tampered");
  const source = await workspace();
  const target = await workspace();

  try {
    await seed(source);
    await dumpDatabase(source, dumpDirectory);

    cpSync(dumpDirectory, tampered, { recursive: true });
    tamper(tampered, "public", "credit_ledger", (row) => row.kind === "usage", (row) => {
      row.amount_micros = "-1";
    });

    await assert.rejects(
      () => restoreDatabase(target, tampered),
      (error) => {
        assert.equal(error instanceof BackupRefused, true);
        assert.match(error.message, /does not match/);
        assert.match(error.details.join(" "), /credit_ledger/);

        return true;
      },
    );

    const users = await target.prepare("SELECT COUNT(*) AS count FROM users").get();

    assert.equal(Number(users.count), 1, "only the seeded dev user remains");
  } finally {
    await source.close();
    await target.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a dump whose ledger disagrees with the balances is never written", async () => {
  const directory = mkdtempSync(join(tmpdir(), "gateway-dump-"));
  const dumpDirectory = join(directory, "dump");
  const source = await workspace();

  try {
    await seed(source);
    await source
      .prepare("UPDATE users SET credit_micros = 9999 WHERE id = ?")
      .run("user_a");

    await assert.rejects(
      () => dumpDatabase(source, dumpDirectory),
      (error) => {
        assert.equal(error instanceof BackupRefused, true);
        assert.match(error.message, /does not reconstruct/);
        assert.match(error.details.join(" "), /user_a/);

        return true;
      },
    );
  } finally {
    await source.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("restore refuses a populated target unless forced, and a short table", async () => {
  const directory = mkdtempSync(join(tmpdir(), "gateway-dump-"));
  const dumpDirectory = join(directory, "dump");
  const shortDirectory = join(directory, "short");
  const source = await workspace();
  const target = await workspace();

  try {
    await seed(source);
    await dumpDatabase(source, dumpDirectory);
    await restoreDatabase(target, dumpDirectory);

    await assert.rejects(
      () => restoreDatabase(target, dumpDirectory),
      (error) => {
        assert.equal(error instanceof BackupRefused, true);
        assert.match(error.message, /already holds 2 customer/);

        return true;
      },
    );

    const forced = await restoreDatabase(target, dumpDirectory, { force: true });

    assert.equal(forced.balance.mismatches, 0);

    cpSync(dumpDirectory, shortDirectory, { recursive: true });

    const topups = join(shortDirectory, "public.topups.jsonl");
    const lines = readFileSync(topups, "utf8").split("\n").filter(Boolean);

    writeFileSync(topups, `${lines.slice(0, -1).join("\n")}\n`);

    await assert.rejects(
      () => restoreDatabase(target, shortDirectory, { force: true }),
      (error) => {
        assert.equal(error instanceof BackupRefused, true);
        assert.match(error.message, /manifest says/);

        return true;
      },
    );

    const users = await target.prepare("SELECT COUNT(*) AS count FROM users").get();

    assert.equal(Number(users.count), 3, "the failed restore rolled back");
  } finally {
    await source.close();
    await target.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a restored payment event rejects a replay", async () => {
  const directory = mkdtempSync(join(tmpdir(), "gateway-dump-"));
  const dumpDirectory = join(directory, "dump");
  const source = await workspace();
  const restored = await workspace();

  try {
    await seed(source);
    await dumpDatabase(source, dumpDirectory);
    await restoreDatabase(restored, dumpDirectory);

    await assert.rejects(
      () =>
        restored
          .prepare(
            `INSERT INTO billing_events (id, type, processed_at)
             VALUES ('evt_1', 'checkout.session.completed', ?)`,
          )
          .run(NOW),
      (error) => {
        assert.equal(error.code, "23505");

        return true;
      },
    );
    await assert.rejects(
      () =>
        restored
          .prepare(
            `INSERT INTO topups
              (id, user_id, provider_ref, amount_micros, status, created_at)
             VALUES ('topup_replay', 'user_a', 'cs_1', 8000, 'paid', ?)`,
          )
          .run(NOW),
      (error) => {
        assert.equal(error.code, "23505");

        return true;
      },
    );

    const credit = await availableCredit(restored, "user_a");

    assert.equal(credit.creditMicros, 5000, "a rejected replay cannot credit twice");
  } finally {
    await source.close();
    await restored.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
