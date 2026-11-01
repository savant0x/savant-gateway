import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  activeAccountCount,
  allocatedOn,
  allocationSummary,
  ensureAllocation,
} from "../lib/storage/ledger/allocations.ts";
import {
  getAllocationConfig,
  getAllocationSummary,
  saveAllocationConfig,
} from "../lib/storage/store/allocations.ts";
import { getDailyTrialSummary } from "../lib/storage/store/daily-trial.ts";
import {
  reserveFreeCall,
  settleFreeReservation,
} from "../lib/storage/store/free-pool.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const DAY = "2026-10-31";
const NOW = "2026-10-31T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);

const CONFIG = {
  enabled: true,
  dailyPoolTokens: 1_000_000,
  allocationBps: 10_000,
  accountDailyCapTokens: 0,
};

/**
 * The allocation and trial cluster on the target engine (FID-086, Batch B).
 *
 * Three promises are under test, and all three are about scarcity:
 *
 * 1. A late signup lowers existing grants to the new even split, so the first
 *    account of the day cannot keep the pool.
 * 2. That lowering never goes below what an account has already used or holds,
 *    because a grant below committed usage cannot be honoured.
 * 3. An elapsed reservation becomes quarantine rather than a refund, and a
 *    blocked admission still performs that sweep.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES ('u1', 'u1@example.test', 'One', 'active', ?),
              ('u2', 'u2@example.test', 'Two', 'active', ?),
              ('u3', 'u3@example.test', 'Three', 'active', ?)`,
    )
    .run(NOW, NOW, NOW);

  await db
    .prepare(
      `INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, status, created_at)
       VALUES ('key_1', 'u1', 'Key', 'sk_test', 'hash_1', 'active', ?),
              ('key_2', 'u2', 'Key', 'sk_test', 'hash_2', 'active', ?)`,
    )
    .run(NOW, NOW);

  return db;
}

async function allocated(db, userId) {
  const row = await db
    .prepare(
      "SELECT allocated_tokens FROM free_pool_allocations WHERE day = ? AND user_id = ?",
    )
    .get(DAY, userId);

  return Number(row?.allocated_tokens ?? 0);
}

test("an even split follows the active account count", async () => {
  const db = await fixture();

  try {
    assert.equal(await activeAccountCount(db), 2);

    const first = await ensureAllocation(db, {
      userId: "u1",
      day: DAY,
      config: CONFIG,
      now: NOW,
    });

    assert.equal(first, 500_000);
    assert.equal(await allocatedOn(db, DAY), 500_000);

    // u3 now counts as an account.
    await db
      .prepare(
        `INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, status, created_at)
         VALUES ('key_3', 'u3', 'Key', 'sk_test', 'hash_3', 'active', ?)`,
      )
      .run(NOW);

    assert.equal(await activeAccountCount(db), 3);

    const rebalanced = await ensureAllocation(db, {
      userId: "u1",
      day: DAY,
      config: CONFIG,
      now: NOW,
    });

    assert.equal(rebalanced, 333_333, "the earlier grant is lowered");
    assert.equal(await allocated(db, "u1"), 333_333);
    assert.equal(
      await allocated(db, "u2"),
      0,
      "a share exists only once the account asks for one",
    );

    const second = await ensureAllocation(db, {
      userId: "u2",
      day: DAY,
      config: CONFIG,
      now: NOW,
    });
    const third = await ensureAllocation(db, {
      userId: "u3",
      day: DAY,
      config: CONFIG,
      now: NOW,
    });

    assert.equal(second, 333_333);
    assert.equal(third, 333_333);
    assert.equal(await allocated(db, "u3"), 333_333);

    const summary = await allocationSummary(db, {
      day: DAY,
      config: CONFIG,
      now: NOW,
    });

    assert.equal(
      summary.allocatedTokens,
      999_999,
      "flooring each share must not over-allocate the pool",
    );
  } finally {
    await db.close();
  }
});

test("a grant is never lowered below committed usage", async () => {
  const db = await fixture();

  try {
    await ensureAllocation(db, { userId: "u1", day: DAY, config: CONFIG, now: NOW });

    // Pretend u1 was granted more and already spent 450k of it, then a third
    // account appears and the even split drops to 333,333.
    await db
      .prepare(
        "UPDATE free_pool_allocations SET allocated_tokens = 500000 WHERE day = ? AND user_id = 'u1'",
      )
      .run(DAY);
    await db
      .prepare(
        `INSERT INTO free_pool_usage (user_id, day, weighted_tokens, updated_at)
         VALUES ('u1', ?, 450000, ?)`,
      )
      .run(DAY, NOW);
    await db
      .prepare(
        `INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, status, created_at)
         VALUES ('key_3', 'u3', 'Key', 'sk_test', 'hash_3', 'active', ?)`,
      )
      .run(NOW);

    const kept = await ensureAllocation(db, {
      userId: "u1",
      day: DAY,
      config: CONFIG,
      now: NOW,
    });

    assert.equal(kept, 450_000, "the floor is what was already spent");
  } finally {
    await db.close();
  }
});

test("an ineligible account's grant is withdrawn", async () => {
  const db = await fixture();

  try {
    await ensureAllocation(db, { userId: "u1", day: DAY, config: CONFIG, now: NOW });

    assert.equal(await allocated(db, "u1"), 500_000);

    await db
      .prepare("UPDATE api_keys SET status = 'revoked' WHERE user_id = 'u1'")
      .run();

    const withdrawn = await ensureAllocation(db, {
      userId: "u1",
      day: DAY,
      config: CONFIG,
      now: NOW,
    });

    assert.equal(withdrawn, 0, "an account with no active key holds no share");
  } finally {
    await db.close();
  }
});

test("the summary reports allocations, usage and live holds", async () => {
  const db = await fixture();

  try {
    await ensureAllocation(db, { userId: "u1", day: DAY, config: CONFIG, now: NOW });
    await db
      .prepare(
        `INSERT INTO free_pool_usage (user_id, day, weighted_tokens, updated_at)
         VALUES ('u1', ?, 1200, ?)`,
      )
      .run(DAY, NOW);
    await db
      .prepare(
        `INSERT INTO free_pool_reservations
          (id, user_id, api_key_id, model_id, provider_slug, day,
           weighted_tokens, created_at, expires_at)
         VALUES ('free_held', 'u1', 'key_1', 'm1', 'savant', ?, 300, ?, ?)`,
      )
      .run(DAY, NOW, "2026-10-31T12:05:00.000Z");

    const summary = await allocationSummary(db, {
      day: DAY,
      config: CONFIG,
      now: NOW,
    });

    assert.equal(summary.activeAccounts, 2);
    assert.equal(summary.allocatedTokens, 500_000);
    assert.equal(summary.usedTokens, 1_200);
    assert.equal(summary.perAccountTokens, 500_000);

    const u1 = summary.rows.find((row) => row.userId === "u1");

    assert.equal(u1.allocatedTokens, 500_000);
    assert.equal(u1.usedTokens, 1_200);
    assert.equal(u1.heldTokens, 300);

    const u2 = summary.rows.find((row) => row.userId === "u2");

    assert.equal(u2.usedTokens, 0);
  } finally {
    await db.close();
  }
});

test("saved settings outrank the environment defaults", async () => {
  const db = await fixture();

  try {
    const saved = await saveAllocationConfig(db, {
      enabled: false,
      dailyPoolTokens: 2_500_000,
      allocationBps: 4_000,
      accountDailyCapTokens: 75_000,
    });

    assert.equal(saved.enabled, false);
    assert.equal(saved.dailyPoolTokens, 2_500_000);
    assert.equal(saved.allocationBps, 4_000);
    assert.equal(saved.accountDailyCapTokens, 75_000);
    assert.deepEqual(await getAllocationConfig(db), saved);
  } finally {
    await db.close();
  }
});

test("an unobserved provider reports no allocatable capacity", async () => {
  const db = await fixture();

  try {
    const summary = await getAllocationSummary(db, DAY);

    assert.equal(summary.capacityAvailable, false);
    assert.equal(
      summary.allocatableTokens,
      0,
      "no current observation means no pool to divide",
    );
    assert.ok(summary.configuredDailyPoolTokens > 0);
  } finally {
    await db.close();
  }
});

test("a daily trial summary refuses to invent available credits", async () => {
  const db = await fixture();

  try {
    const summary = await getDailyTrialSummary(db, "u1");

    assert.ok(summary, "trials are not the billing source here");
    assert.equal(summary.available, false);
    assert.equal(summary.activated, true);
    assert.equal(summary.allocatedTokens, 0);
    assert.equal(summary.remainingTokens, null);
    assert.equal(summary.resetsAt, null);

    const unactivated = await getDailyTrialSummary(db, "u3");

    assert.equal(unactivated.activated, false);
    assert.equal(unactivated.available, false);
  } finally {
    await db.close();
  }
});

test("admission is refused while the provider has no current observation", async () => {
  const db = await fixture();

  try {
    const result = await reserveFreeCall(db, {
      auth: { userId: "u1", keyId: "key_1" },
      model: { id: "m1", upstreamSlug: "savant", tokenWeight: 1 },
      promptTokens: 100,
      outputBudget: 100,
      now: NOW_MS,
    });

    assert.equal(result.ok, false);
    assert.equal(typeof result.blocked.message, "string");
    assert.ok(result.blocked.message.length > 0);

    const row = await db
      .prepare("SELECT COUNT(*) AS n FROM free_pool_reservations")
      .get();

    assert.equal(Number(row.n), 0, "a refused call holds nothing");
  } finally {
    await db.close();
  }
});

test("an elapsed reservation becomes quarantine, even on a refused call", async () => {
  const db = await fixture();

  try {
    await db
      .prepare(
        `INSERT INTO free_pool_reservations
          (id, user_id, api_key_id, model_id, provider_slug, day,
           weighted_tokens, created_at, expires_at)
         VALUES ('free_stale', 'u2', 'key_2', 'm2', 'savant', ?,
                 700, '2026-10-31T11:00:00.000Z', '2026-10-31T11:10:00.000Z')`,
      )
      .run(DAY);

    const result = await reserveFreeCall(db, {
      auth: { userId: "u1", keyId: "key_1" },
      model: { id: "m1", upstreamSlug: "savant", tokenWeight: 1 },
      promptTokens: 100,
      outputBudget: 100,
      now: NOW_MS,
    });

    assert.equal(result.ok, false);

    const left = await db
      .prepare("SELECT COUNT(*) AS n FROM free_pool_reservations")
      .get();

    assert.equal(Number(left.n), 0);

    const quarantined = await db
      .prepare(
        "SELECT kind, reserved, status FROM quarantined_holds WHERE id = 'free_stale'",
      )
      .get();

    assert.equal(quarantined.kind, "free");
    assert.equal(Number(quarantined.reserved), 700);
    assert.equal(quarantined.status, "quarantined");
  } finally {
    await db.close();
  }
});

test("settlement releases the hold and records the actual usage", async () => {
  const db = await fixture();

  try {
    await db
      .prepare(
        `INSERT INTO free_pool_reservations
          (id, user_id, api_key_id, model_id, provider_slug, day,
           weighted_tokens, created_at, expires_at)
         VALUES ('free_1', 'u1', 'key_1', 'm1', 'savant', ?, 500, ?, ?)`,
      )
      .run(DAY, NOW, "2026-10-31T12:05:00.000Z");

    await settleFreeReservation(db, {
      reservation: { id: "free_1", day: DAY, weightedTokens: 500 },
      userId: "u1",
      weightedTokens: 320,
      settledAt: NOW,
    });

    const usage = await db
      .prepare(
        "SELECT weighted_tokens FROM free_pool_usage WHERE user_id = 'u1' AND day = ?",
      )
      .get(DAY);

    assert.equal(Number(usage.weighted_tokens), 320);

    const held = await db
      .prepare("SELECT COUNT(*) AS n FROM free_pool_reservations")
      .get();

    assert.equal(Number(held.n), 0);

    await settleFreeReservation(db, {
      reservation: { id: "free_1", day: DAY, weightedTokens: 500 },
      userId: "u1",
      weightedTokens: 0,
      settledAt: NOW,
    });

    const unchanged = await db
      .prepare(
        "SELECT weighted_tokens FROM free_pool_usage WHERE user_id = 'u1' AND day = ?",
      )
      .get(DAY);

    assert.equal(
      Number(unchanged.weighted_tokens),
      320,
      "a zero-token settlement adds nothing",
    );

    const second = await db
      .prepare(
        `INSERT INTO free_pool_reservations
          (id, user_id, api_key_id, model_id, provider_slug, day,
           weighted_tokens, created_at, expires_at)
         VALUES ('free_2', 'u1', 'key_1', 'm1', 'savant', ?, 100, ?, ?)`,
      )
      .run(DAY, NOW, "2026-10-31T12:05:00.000Z");

    assert.ok(second);

    await settleFreeReservation(db, {
      reservation: { id: "free_2", day: DAY, weightedTokens: 100 },
      userId: "u1",
      weightedTokens: 80,
      settledAt: NOW,
    });

    const accumulated = await db
      .prepare(
        "SELECT weighted_tokens FROM free_pool_usage WHERE user_id = 'u1' AND day = ?",
      )
      .get(DAY);

    assert.equal(
      Number(accumulated.weighted_tokens),
      400,
      "usage accumulates inside the day",
    );
  } finally {
    await db.close();
  }
});
