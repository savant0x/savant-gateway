import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import {
  allocationShare,
  accountDailyAllowance,
  allocatableTokens,
  clampAllocationBps,
  DEFAULT_FREE_POOL_ALLOCATION_BPS,
  DEFAULT_FREE_POOL_DAILY_TOKENS,
  readAllocationConfig,
  remainingAllocation,
  observedDailyPool,
} from "../lib/allocation.ts";
import {
  activeAccountCount,
  allocatedOn,
  allocationSummary,
  ensureAllocation,
} from "../lib/allocation-ledger.ts";
import { allocationSchema } from "../lib/schema/allocations.ts";

const DAY = "2026-10-29";
const NOW = "2026-10-29T12:00:00.000Z";

function config(overrides = {}) {
  return {
    enabled: true,
    dailyPoolTokens: DEFAULT_FREE_POOL_DAILY_TOKENS,
    allocationBps: DEFAULT_FREE_POOL_ALLOCATION_BPS,
    accountDailyCapTokens: 100_000,
    ...overrides,
  };
}

function database(accounts) {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE TABLE api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      last_used_at TEXT
    );
    CREATE TABLE free_pool_usage (
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      weighted_tokens INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, day)
    );
    CREATE TABLE free_pool_reservations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      weighted_tokens INTEGER NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  allocationSchema(db);

  for (const account of accounts) {
    db.prepare(
      "INSERT INTO users (id, email, name, status, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(
      account.id,
      account.email ?? `${account.id}@example.com`,
      account.name ?? account.id,
      account.status ?? "active",
      NOW,
    );

    if (account.key !== false) {
      db.prepare(
        `INSERT INTO api_keys
           (id, user_id, name, prefix, secret_hash, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        `key_${account.id}`,
        account.id,
        "default",
        "sk-test",
        `hash_${account.id}`,
        account.keyStatus ?? "active",
        NOW,
      );
    }
  }

  return db;
}

test("defaults describe a 20M daily pool with a 90% allocation", () => {
  const defaults = readAllocationConfig({});

  assert.equal(defaults.enabled, true);
  assert.equal(defaults.dailyPoolTokens, 20_000_000);
  assert.equal(defaults.allocationBps, 9_000);
  assert.equal(allocatableTokens(defaults), 18_000_000);
});

test("environment values are parsed and bounded", () => {
  const configured = readAllocationConfig({
    FREE_POOL_ALLOCATION_ENABLED: "false",
    FREE_POOL_DAILY_WEIGHTED_TOKENS: "5000000",
    FREE_POOL_ALLOCATION_BPS: "7500",
  });

  assert.equal(configured.enabled, false);
  assert.equal(configured.dailyPoolTokens, 5_000_000);
  assert.equal(configured.allocationBps, 7_500);

  const invalid = readAllocationConfig({
    FREE_POOL_DAILY_WEIGHTED_TOKENS: "-5",
    FREE_POOL_ALLOCATION_BPS: "nonsense",
  });

  assert.equal(invalid.dailyPoolTokens, DEFAULT_FREE_POOL_DAILY_TOKENS);
  assert.equal(invalid.allocationBps, DEFAULT_FREE_POOL_ALLOCATION_BPS);
  assert.equal(clampAllocationBps(20_000), 10_000);
  assert.equal(clampAllocationBps(-1), 0);
});

test("an even split divides the allocatable pool across accounts", () => {
  assert.equal(
    allocationShare({
      allocatableTokens: 18_000_000,
      activeAccounts: 5,
      alreadyAllocated: 0,
    }),
    3_600_000,
  );
});

test("a late account can only take what is still unallocated", () => {
  assert.equal(
    allocationShare({
      allocatableTokens: 18_000_000,
      activeAccounts: 6,
      alreadyAllocated: 18_000_000,
    }),
    0,
  );
  assert.equal(
    allocationShare({
      allocatableTokens: 18_000_000,
      activeAccounts: 5,
      alreadyAllocated: 14_400_000,
    }),
    3_600_000,
  );
  assert.equal(
    allocationShare({
      allocatableTokens: 18_000_000,
      activeAccounts: 0,
      alreadyAllocated: 0,
    }),
    0,
  );
});

test("remaining allocation never goes negative", () => {
  assert.equal(
    remainingAllocation({
      allocatedTokens: 1_000,
      usedTokens: 400,
      heldTokens: 200,
    }),
    400,
  );
  assert.equal(
    remainingAllocation({
      allocatedTokens: 1_000,
      usedTokens: 900,
      heldTokens: 400,
    }),
    0,
  );
});

test("only active accounts holding an active key count", () => {
  const db = database([
    { id: "u1" },
    { id: "u2", status: "disabled" },
    { id: "u3", key: false },
    { id: "u4", keyStatus: "revoked" },
  ]);

  assert.equal(activeAccountCount(db), 1);
});

test("a returning allocation respects a lowered observed pool and resets by day", () => {
  const db = database([{ id: "u1" }, { id: "u2" }]);
  const base = config();

  const first = ensureAllocation(db, {
    userId: "u1",
    day: DAY,
    config: base,
    now: NOW,
  });

  assert.equal(first, 9_000_000);
  assert.equal(
    ensureAllocation(db, {
      userId: "u1",
      day: DAY,
      config: config({ dailyPoolTokens: 1_000_000 }),
      now: NOW,
    }),
    450_000,
  );
  assert.equal(
    ensureAllocation(db, {
      userId: "u1",
      day: "2026-10-30",
      config: base,
      now: NOW,
    }),
    9_000_000,
  );
});

test("daily trial capacity excludes externally consumed upstream tokens", () => {
  assert.equal(observedDailyPool({ configured: 20_000_000, limit: 20_000_000,
    remaining: 5_000_000, localUsedBeforeObservation: 1_000_000 }), 6_000_000);
  assert.equal(observedDailyPool({ configured: 20_000_000, limit: null,
    remaining: 20_000_000, localUsedBeforeObservation: 0 }), 0);
  assert.equal(observedDailyPool({ configured: 20_000_000, limit: 20_000_000,
    remaining: null, localUsedBeforeObservation: 0 }), 0);
  assert.equal(observedDailyPool({ configured: 10_000, limit: 20_000_000,
    remaining: 20_000_000, localUsedBeforeObservation: 1_000_000 }), 10_000);
  assert.equal(observedDailyPool({ configured: 10_000, unlimited: true,
    limit: null, remaining: null, localUsedBeforeObservation: 0 }), 10_000);
});

test("suspended accounts release unspent allocation for the active user base", () => {
  const db = database([{ id: "u1" }, { id: "u2" }, { id: "u3", key: false }]);
  const base = config();

  for (const id of ["u1", "u2"]) {
    ensureAllocation(db, { userId: id, day: DAY, config: base, now: NOW });
  }
  db.prepare("UPDATE users SET status = 'suspended' WHERE id = 'u2'").run();
  db.prepare(`INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, created_at)
    VALUES ('key_u3', 'u3', 'default', 'sk-test', 'hash_u3', ?)`)
    .run(NOW);
  assert.equal(ensureAllocation(db, { userId: "u3", day: DAY, config: base, now: NOW }), 9_000_000);
  assert.equal(db.prepare("SELECT allocated_tokens FROM free_pool_allocations WHERE user_id='u2'").get().allocated_tokens, 0);
  assert.equal(allocatedOn(db, DAY), 18_000_000);
  db.close();
});

test("a joining account rebalances an unspent allocation", () => {
  const db = database([{ id: "u1" }]);
  const base = config();

  assert.equal(
    ensureAllocation(db, { userId: "u1", day: DAY, config: base, now: NOW }),
    18_000_000,
  );

  db.prepare(
    `INSERT INTO users (id, email, name, status, created_at)
     VALUES ('u2', 'u2@example.com', 'u2', 'active', ?)`,
  ).run(NOW);
  db.prepare(
    `INSERT INTO api_keys
       (id, user_id, name, prefix, secret_hash, status, created_at)
     VALUES ('key_u2', 'u2', 'default', 'sk-test', 'hash_u2', 'active', ?)`,
  ).run(NOW);

  assert.equal(
    ensureAllocation(db, { userId: "u2", day: DAY, config: base, now: NOW }),
    9_000_000,
  );

  const first = db
    .prepare(
      "SELECT allocated_tokens FROM free_pool_allocations WHERE day = ? AND user_id = 'u1'",
    )
    .get(DAY);

  assert.equal(first.allocated_tokens, 9_000_000);
  assert.equal(allocatedOn(db, DAY), 18_000_000);
});

test("rebalancing never cuts below recorded usage and holds", () => {
  const db = database([{ id: "u1" }]);
  const base = config();

  ensureAllocation(db, { userId: "u1", day: DAY, config: base, now: NOW });
  db.prepare(
    "INSERT INTO free_pool_usage (user_id, day, weighted_tokens, updated_at) VALUES (?, ?, ?, ?)",
  ).run("u1", DAY, 12_000_000, NOW);

  db.prepare(
    `INSERT INTO users (id, email, name, status, created_at)
     VALUES ('u2', 'u2@example.com', 'u2', 'active', ?)`,
  ).run(NOW);
  db.prepare(
    `INSERT INTO api_keys
       (id, user_id, name, prefix, secret_hash, status, created_at)
     VALUES ('key_u2', 'u2', 'default', 'sk-test', 'hash_u2', 'active', ?)`,
  ).run(NOW);

  assert.equal(
    ensureAllocation(db, { userId: "u2", day: DAY, config: base, now: NOW }),
    6_000_000,
  );

  const first = db
    .prepare(
      "SELECT allocated_tokens FROM free_pool_allocations WHERE day = ? AND user_id = 'u1'",
    )
    .get(DAY);

  assert.equal(first.allocated_tokens, 12_000_000);
  assert.equal(allocatedOn(db, DAY), 18_000_000);
});

test("a third activated account rebalances without overselling the day", () => {
  const db = database([{ id: "u1" }, { id: "u2" }]);
  const base = config();

  for (const id of ["u1", "u2"]) {
    ensureAllocation(db, { userId: id, day: DAY, config: base, now: NOW });
  }

  db.prepare(
    `INSERT INTO users (id, email, name, status, created_at)
     VALUES ('u3', 'u3@example.com', 'u3', 'active', ?)`,
  ).run(NOW);
  db.prepare(
    `INSERT INTO api_keys
       (id, user_id, name, prefix, secret_hash, status, created_at)
     VALUES ('key_u3', 'u3', 'default', 'sk-test', 'hash_u3', 'active', ?)`,
  ).run(NOW);

  assert.equal(
    ensureAllocation(db, {
      userId: "u3",
      day: DAY,
      config: base,
      now: NOW,
    }),
    6_000_000,
  );
  assert.equal(allocatedOn(db, DAY), 18_000_000);
});

test("summary reports pool, allocations, usage and holds", () => {
  const db = database([{ id: "u1" }, { id: "u2" }]);
  const base = config();

  ensureAllocation(db, { userId: "u1", day: DAY, config: base, now: NOW });
  ensureAllocation(db, { userId: "u2", day: DAY, config: base, now: NOW });
  db.prepare(
    "INSERT INTO free_pool_usage (user_id, day, weighted_tokens, updated_at) VALUES (?, ?, ?, ?)",
  ).run("u1", DAY, 1_200_000, NOW);
  db.prepare(
    "INSERT INTO free_pool_reservations (id, user_id, weighted_tokens, expires_at) VALUES (?, ?, ?, ?)",
  ).run("r1", "u2", 500_000, "2026-10-29T13:00:00.000Z");

  const summary = allocationSummary(db, { day: DAY, config: base, now: NOW });

  assert.equal(summary.allocatableTokens, 18_000_000);
  assert.equal(summary.reservedTokens, 2_000_000);
  assert.equal(summary.activeAccounts, 2);
  assert.equal(summary.perAccountTokens, 9_000_000);
  assert.equal(summary.allocatedTokens, 18_000_000);
  assert.equal(summary.usedTokens, 1_200_000);
  assert.equal(summary.rows.length, 2);

  const first = summary.rows.find((row) => row.userId === "u1");

  assert.equal(first.allocatedTokens, 9_000_000);
  assert.equal(first.usedTokens, 1_200_000);

  const second = summary.rows.find((row) => row.userId === "u2");

  assert.equal(second.heldTokens, 500_000);
});

test("the per-account cap lowers a share and zero disables it", () => {
  const share = 3_600_000;

  assert.equal(
    accountDailyAllowance(
      { ...config(), accountDailyCapTokens: 100_000 },
      share,
    ),
    100_000,
  );
  assert.equal(
    accountDailyAllowance({ ...config(), accountDailyCapTokens: 0 }, share),
    share,
  );
  // A cap above the share cannot raise the allowance above the split.
  assert.equal(
    accountDailyAllowance(
      { ...config(), accountDailyCapTokens: 9_000_000 },
      share,
    ),
    share,
  );
  // Below the cap, the share is what binds.
  assert.equal(
    accountDailyAllowance(
      { ...config(), accountDailyCapTokens: 500_000 },
      90_000,
    ),
    90_000,
  );
});

test("a missing or malformed cap is treated as disabled, not as zero allowance", () => {
  for (const value of [undefined, null, Number.NaN, "nonsense", -10]) {
    assert.equal(
      accountDailyAllowance(
        { ...config(), accountDailyCapTokens: value },
        250_000,
      ),
      250_000,
      String(value),
    );
  }
});

test("the cap applies to the fixed fallback allowance when allocation is off", () => {
  const disabled = {
    ...config({ enabled: false }),
    accountDailyCapTokens: 120_000,
  };

  assert.equal(accountDailyAllowance(disabled, 500_000), 120_000);
});

test("the summary reports the even share next to the capped allowance", () => {
  const db = database([{ id: "a" }, { id: "b" }]);
  const summary = allocationSummary(db, {
    day: DAY,
    config: { ...config(), accountDailyCapTokens: 100_000 },
    now: NOW,
  });

  assert.equal(summary.activeAccounts, 2);
  assert.equal(summary.perAccountTokens, 9_000_000);
  assert.equal(summary.effectivePerAccountTokens, 100_000);
  assert.equal(summary.accountDailyCapTokens, 100_000);
  db.close();
});

test("the environment default caps every account at 100k weighted tokens", () => {
  assert.equal(readAllocationConfig({}).accountDailyCapTokens, 100_000);
  assert.equal(
    readAllocationConfig({ FREE_ACCOUNT_DAILY_CAP: "0" }).accountDailyCapTokens,
    0,
  );
  assert.equal(
    readAllocationConfig({ FREE_ACCOUNT_DAILY_CAP: "250000" })
      .accountDailyCapTokens,
    250_000,
  );
});
