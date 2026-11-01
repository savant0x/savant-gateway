import type { PostgresDatabase } from "../pg-adapter.ts";
import type { AllocationSummary } from "../../allocation-ledger.ts";
import type { AllocationConfig } from "../../allocation.ts";

import {
  accountDailyAllowance,
  allocatableTokens,
  allocationShare,
} from "../../allocation.ts";

/**
 * Daily free-pool allocation ledger, ported to the async handle (FID-086,
 * Batch B).
 *
 * The rule this module implements is the one that keeps a shared pool fair: an
 * account's share is the even split of today's allocatable tokens, re-derived
 * whenever a new activated account joins. Existing grants are *lowered* to the
 * new fair share — but never below what the account has already used or holds —
 * so the first account of the day cannot keep the whole pool while every later
 * signup receives zero.
 *
 * The rebalance is a loop of small updates, exactly as in the SQLite version.
 * It is not set-based because each row's floor comes from a different account's
 * committed usage; expressing that as one statement would be a correlated
 * subquery with two aggregates over the same table, which is harder to audit
 * than the loop it replaces.
 *
 * `ON CONFLICT DO NOTHING ... RETURNING` replaces `INSERT OR IGNORE` followed by
 * a select: the insert reports the value it wrote, and a conflict reports none.
 * `BIGINT`/aggregate columns arrive as strings and are coerced here.
 */

export async function activeAccountCount(db: PostgresDatabase) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM users u
        WHERE u.status = 'active'
          AND EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.user_id = u.id AND k.status = 'active'
          )`,
    )
    .get<{ total: number | string }>();

  return Math.max(0, Number(row?.total ?? 0));
}

export async function allocatedOn(db: PostgresDatabase, day: string) {
  const row = await db
    .prepare(
      "SELECT COALESCE(SUM(allocated_tokens), 0) AS total FROM free_pool_allocations WHERE day = ?",
    )
    .get<{ total: number | string }>(day);

  return Math.max(0, Number(row?.total ?? 0));
}

async function usedAndHeld(
  db: PostgresDatabase,
  userId: string,
  day: string,
  now: string,
) {
  const used = await db
    .prepare(
      "SELECT COALESCE(weighted_tokens, 0) AS total FROM free_pool_usage WHERE user_id = ? AND day = ?",
    )
    .get<{ total: number | string }>(userId, day);
  const held = await db
    .prepare(
      `SELECT COALESCE(SUM(weighted_tokens), 0) AS total
         FROM free_pool_reservations
        WHERE user_id = ? AND expires_at > ?`,
    )
    .get<{ total: number | string }>(userId, now);

  return {
    used: Math.max(0, Number(used?.total ?? 0)),
    held: Math.max(0, Number(held?.total ?? 0)),
  };
}

/**
 * Grants one account its share of today's allocatable pool. Call inside the
 * caller's transaction: the active-account count, the day's already allocated
 * total and the insert must agree, or two signups can both claim the last slice.
 */
export async function ensureAllocation(
  db: PostgresDatabase,
  input: {
    userId: string;
    day: string;
    config: AllocationConfig;
    now: string;
  },
): Promise<number> {
  const allocatable = allocatableTokens(input.config);
  const accounts = await activeAccountCount(db);
  const existing = await db
    .prepare(
      "SELECT allocated_tokens FROM free_pool_allocations WHERE day = ? AND user_id = ?",
    )
    .get<{ allocated_tokens: number | string }>(input.day, input.userId);

  const fairShare = accounts > 0 ? Math.floor(allocatable / accounts) : 0;
  const rows = await db
    .prepare(
      `SELECT a.user_id, a.allocated_tokens,
              EXISTS (
                SELECT 1 FROM users u
                  JOIN api_keys k ON k.user_id = u.id
                 WHERE u.id = a.user_id AND u.status = 'active'
                   AND k.status = 'active'
              ) AS eligible
         FROM free_pool_allocations a
        WHERE a.day = ?`,
    )
    .all<{
      user_id: string;
      allocated_tokens: number | string;
      eligible: boolean;
    }>(input.day);

  for (const row of rows) {
    const allocated = Number(row.allocated_tokens);
    const committed = await usedAndHeld(db, row.user_id, input.day, input.now);
    const committedFloor = Math.min(allocated, committed.used + committed.held);
    const rebalanced = Math.min(
      allocated,
      Math.max(row.eligible ? fairShare : 0, committedFloor),
    );

    if (rebalanced !== allocated) {
      await db
        .prepare(
          "UPDATE free_pool_allocations SET allocated_tokens = ? WHERE day = ? AND user_id = ?",
        )
        .run(rebalanced, input.day, row.user_id);
    }
  }

  if (existing) {
    const updated = await db
      .prepare(
        "SELECT allocated_tokens FROM free_pool_allocations WHERE day = ? AND user_id = ?",
      )
      .get<{ allocated_tokens: number | string }>(input.day, input.userId);

    return Math.max(0, Number(updated?.allocated_tokens ?? 0));
  }

  const share = allocationShare({
    allocatableTokens: allocatable,
    activeAccounts: accounts,
    alreadyAllocated: await allocatedOn(db, input.day),
  });
  const inserted = await db
    .prepare(
      `INSERT INTO free_pool_allocations (day, user_id, allocated_tokens, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT DO NOTHING
       RETURNING allocated_tokens`,
    )
    .all<{ allocated_tokens: number | string }>(
      input.day,
      input.userId,
      share,
      input.now,
    );

  if (inserted.length > 0) {
    return Math.max(0, Number(inserted[0].allocated_tokens));
  }

  const raced = await db
    .prepare(
      "SELECT allocated_tokens FROM free_pool_allocations WHERE day = ? AND user_id = ?",
    )
    .get<{ allocated_tokens: number | string }>(input.day, input.userId);

  return Math.max(0, Number(raced?.allocated_tokens ?? 0));
}

export async function allocationSummary(
  db: PostgresDatabase,
  input: { day: string; config: AllocationConfig; now: string },
): Promise<AllocationSummary> {
  const allocatable = allocatableTokens(input.config);
  const accounts = await activeAccountCount(db);
  const rows = await db
    .prepare(
      `SELECT u.id AS user_id, u.email, u.name,
              COALESCE(a.allocated_tokens, 0) AS allocated_tokens,
              COALESCE(f.weighted_tokens, 0) AS used_tokens,
              COALESCE(r.held_tokens, 0) AS held_tokens
         FROM users u
         LEFT JOIN free_pool_allocations a
           ON a.user_id = u.id AND a.day = ?
         LEFT JOIN free_pool_usage f
           ON f.user_id = u.id AND f.day = ?
         LEFT JOIN (
           SELECT user_id, SUM(weighted_tokens) AS held_tokens
             FROM free_pool_reservations
            WHERE expires_at > ?
            GROUP BY user_id
         ) r ON r.user_id = u.id
        WHERE u.status = 'active'
          AND EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.user_id = u.id AND k.status = 'active'
          )
        ORDER BY used_tokens DESC, u.email ASC`,
    )
    .all<{
      user_id: string;
      email: string;
      name: string;
      allocated_tokens: number | string;
      used_tokens: number | string;
      held_tokens: number | string;
    }>(input.day, input.day, input.now);
  const perAccount = accounts > 0 ? Math.floor(allocatable / accounts) : 0;

  return {
    day: input.day,
    enabled: input.config.enabled,
    dailyPoolTokens: input.config.dailyPoolTokens,
    configuredDailyPoolTokens: input.config.dailyPoolTokens,
    capacityAvailable: true,
    allocationBps: input.config.allocationBps,
    allocatableTokens: allocatable,
    reservedTokens: Math.max(0, input.config.dailyPoolTokens - allocatable),
    activeAccounts: accounts,
    allocatedTokens: rows.reduce(
      (total, row) => total + Number(row.allocated_tokens),
      0,
    ),
    usedTokens: rows.reduce((total, row) => total + Number(row.used_tokens), 0),
    perAccountTokens: perAccount,
    effectivePerAccountTokens: accountDailyAllowance(input.config, perAccount),
    accountDailyCapTokens: input.config.accountDailyCapTokens,
    rows: rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      name: row.name,
      allocatedTokens: Number(row.allocated_tokens),
      usedTokens: Number(row.used_tokens),
      heldTokens: Number(row.held_tokens),
    })),
  };
}
