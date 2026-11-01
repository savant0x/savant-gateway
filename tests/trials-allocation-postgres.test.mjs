import assert from "node:assert/strict";
import test from "node:test";

import {
  activeAccountCount,
  allocatedOn,
  allocationSummary,
  ensureAllocation,
} from "../lib/storage/ledger/allocations.ts";
import {
  reserveTrial,
  settleTrial,
  trialBalance,
} from "../lib/storage/ledger/trials.ts";
import { createPostgresDatabase } from "../lib/storage/pg-adapter.ts";
import { migrateDatabase } from "../lib/storage/schema/index.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-30T12:00:00.000Z";
const LATER = "2026-10-30T13:00:00.000Z";
const DAY = "2026-10-30";

const CONFIG = {
  enabled: true,
  dailyPoolTokens: 20_000_000,
  allocationBps: 9000,
  accountDailyCapTokens: 100_000,
};

const TRIAL = { enabled: true, grantTokens: 50_000, grantBudget: 500_000 };

async function fixture(accounts = [{ id: "a", verified: NOW, used: 0 }]) {
  const { pool, pglite } = await createPgliteDatabase();
  const db = createPostgresDatabase({ pool });

  await migrateDatabase(db);

  for (const account of accounts) {
    await db
      .prepare(
        `INSERT INTO users
          (id, email, name, status, created_at, email_verified_at, credit_micros)
         VALUES (?, ?, ?, 'active', ?, ?, 0)`,
      )
      .run(
        account.id,
        `${account.id}@example.test`,
        `Account ${account.id}`,
        NOW,
        account.verified,
      );
    await db
      .prepare(
        `INSERT INTO api_keys
          (id, user_id, name, prefix, secret_hash, status, created_at)
         VALUES (?, ?, 'Primary', ?, ?, 'active', ?)`,
      )
      .run(`key_${account.id}`, account.id, `sk_${account.id}`, `hash_${account.id}`, NOW);

    if (account.used) {
      await db
        .prepare(
          `INSERT INTO free_pool_usage (user_id, day, weighted_tokens, updated_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(account.id, DAY, account.used, NOW);
    }
  }

  return { db, pglite };
}

function reserve(db, overrides = {}) {
  return reserveTrial(db, {
    userId: "a",
    id: "trial_1",
    estimated: 1000,
    now: NOW,
    expiresAt: LATER,
    config: TRIAL,
    ...overrides,
  });
}

test("a verified account receives a grant on its first reservation", async () => {
  const { db, pglite } = await fixture();

  try {
    assert.equal(await reserve(db), true);

    const balance = await trialBalance(db, "a", NOW);

    assert.equal(balance.granted, 50_000);
    assert.equal(balance.used, 0);
    assert.equal(balance.held, 1000);
    assert.equal(balance.remaining, 49_000);
  } finally {
    await pglite.close();
  }
});

test("an unverified account receives no grant", async () => {
  const { db, pglite } = await fixture([{ id: "a", verified: null }]);

  try {
    assert.equal(await reserve(db), false);

    const grants = await db
      .prepare("SELECT COUNT(*)::int AS total FROM trial_grants")
      .get();

    assert.equal(Number(grants.total), 0);
  } finally {
    await pglite.close();
  }
});

test("a reservation beyond the remaining balance is refused", async () => {
  const { db, pglite } = await fixture();

  try {
    assert.equal(await reserve(db, { estimated: 50_001 }), false);
    assert.equal(await reserve(db, { estimated: 50_000 }), true);
    assert.equal(await reserve(db, { id: "trial_2", estimated: 1 }), false);
  } finally {
    await pglite.close();
  }
});

test("historic free-pool usage counts against the grant", async () => {
  const { db, pglite } = await fixture([{ id: "a", verified: NOW, used: 49_500 }]);

  try {
    assert.equal(await reserve(db, { estimated: 1000 }), false);

    const balance = await trialBalance(db, "a", NOW);

    assert.equal(balance.granted, 50_000);
    assert.equal(balance.used, 49_500);
    assert.equal(balance.remaining, 500);
  } finally {
    await pglite.close();
  }
});

test("settlement records actual usage once", async () => {
  const { db, pglite } = await fixture();

  try {
    await reserve(db);

    assert.equal(
      await settleTrial(db, { id: "trial_1", userId: "a", actual: 640, now: LATER }),
      true,
    );
    assert.equal(
      await settleTrial(db, { id: "trial_1", userId: "a", actual: 640, now: LATER }),
      false,
      "a retried callback must not count the same tokens twice",
    );

    const balance = await trialBalance(db, "a", LATER);

    assert.equal(balance.used, 640);
    assert.equal(balance.held, 0);
  } finally {
    await pglite.close();
  }
});

test("a disabled trial config reserves nothing", async () => {
  const { db, pglite } = await fixture();

  try {
    assert.equal(
      await reserve(db, { config: { ...TRIAL, enabled: false } }),
      false,
    );
  } finally {
    await pglite.close();
  }
});

test("the pool is split across activated accounts", async () => {
  const { db, pglite } = await fixture([
    { id: "a", verified: NOW, used: 0 },
    { id: "b", verified: NOW, used: 0 },
  ]);

  try {
    assert.equal(await activeAccountCount(db), 2);

    const forA = await ensureAllocation(db, {
      userId: "a",
      day: DAY,
      config: CONFIG,
      now: NOW,
    });
    const forB = await ensureAllocation(db, {
      userId: "b",
      day: DAY,
      config: CONFIG,
      now: NOW,
    });

    // 90% of 20,000,000 split two ways.
    assert.equal(forA, 9_000_000);
    assert.equal(forB, 9_000_000);
    assert.equal(await allocatedOn(db, DAY), 18_000_000);
  } finally {
    await pglite.close();
  }
});

test("a newcomer rebalances the unspent remainder", async () => {
  const { db, pglite } = await fixture();

  try {
    const alone = await ensureAllocation(db, {
      userId: "a",
      day: DAY,
      config: CONFIG,
      now: NOW,
    });

    assert.equal(alone, 18_000_000);

    await db
      .prepare(
        `INSERT INTO users (id, email, name, status, created_at, email_verified_at)
         VALUES ('b', 'b@example.test', 'Account b', 'active', ?, ?)`,
      )
      .run(NOW, NOW);
    await db
      .prepare(
        `INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, status, created_at)
         VALUES ('key_b', 'b', 'Primary', 'sk_b', 'hash_b', 'active', ?)`,
      )
      .run(NOW);

    await ensureAllocation(db, { userId: "b", day: DAY, config: CONFIG, now: NOW });

    const rows = await db
      .prepare(
        "SELECT user_id, allocated_tokens FROM free_pool_allocations WHERE day = ? ORDER BY user_id",
      )
      .all(DAY);

    assert.equal(Number(rows[0].allocated_tokens), 9_000_000);
    assert.equal(Number(rows[1].allocated_tokens), 9_000_000);
  } finally {
    await pglite.close();
  }
});

test("rebalancing never drops an account below what it already used", async () => {
  const { db, pglite } = await fixture([
    { id: "a", verified: NOW, used: 12_000_000 },
  ]);

  try {
    // A is alone first, so it holds the whole allocatable pool, then spends 12M
    // of it. B joining must lower A only to its committed floor, not the share.
    await ensureAllocation(db, { userId: "a", day: DAY, config: CONFIG, now: NOW });

    await db
      .prepare(
        `INSERT INTO users (id, email, name, status, created_at, email_verified_at)
         VALUES ('b', 'b@example.test', 'Account b', 'active', ?, ?)`,
      )
      .run(NOW, NOW);
    await db
      .prepare(
        `INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, status, created_at)
         VALUES ('key_b', 'b', 'Primary', 'sk_b', 'hash_b', 'active', ?)`,
      )
      .run(NOW);

    await ensureAllocation(db, { userId: "b", day: DAY, config: CONFIG, now: NOW });
    await ensureAllocation(db, { userId: "b", day: DAY, config: CONFIG, now: NOW });

    const row = await db
      .prepare(
        "SELECT allocated_tokens FROM free_pool_allocations WHERE day = ? AND user_id = 'a'",
      )
      .get(DAY);

    assert.equal(
      Number(row.allocated_tokens),
      12_000_000,
      "recorded usage is never clawed back",
    );
  } finally {
    await pglite.close();
  }
});

test("the summary reports the pool, the split and per-account rows", async () => {
  const { db, pglite } = await fixture([
    { id: "a", verified: NOW, used: 500 },
    { id: "b", verified: NOW, used: 1000 },
  ]);

  try {
    await ensureAllocation(db, { userId: "a", day: DAY, config: CONFIG, now: NOW });

    const summary = await allocationSummary(db, {
      day: DAY,
      config: CONFIG,
      now: NOW,
    });

    assert.equal(summary.activeAccounts, 2);
    assert.equal(summary.allocatableTokens, 18_000_000);
    assert.equal(summary.reservedTokens, 2_000_000);
    assert.equal(summary.perAccountTokens, 9_000_000);
    assert.equal(
      summary.effectivePerAccountTokens,
      100_000,
      "the daily cap binds below the even share",
    );
    assert.equal(summary.usedTokens, 1500);
    assert.equal(summary.rows.length, 2);
    assert.equal(
      summary.rows[0].userId,
      "b",
      "rows are ordered by usage, highest first",
    );
  } finally {
    await pglite.close();
  }
});
