import type { DatabaseHandle } from "./schema/columns";
import type { AllocationConfig } from "./allocation";

import {
  accountDailyAllowance,
  allocationShare,
  allocatableTokens,
} from "./allocation.ts";

export type AllocationSummaryRow = {
  userId: string;
  email: string;
  name: string;
  allocatedTokens: number;
  usedTokens: number;
  heldTokens: number;
};

export type AllocationSummary = {
  day: string;
  enabled: boolean;
  dailyPoolTokens: number;
  allocationBps: number;
  allocatableTokens: number;
  reservedTokens: number;
  activeAccounts: number;
  allocatedTokens: number;
  usedTokens: number;
  /** The even share of the allocatable pool. */
  perAccountTokens: number;
  /** The share after the per-account daily cap, or the share when uncapped. */
  effectivePerAccountTokens: number;
  accountDailyCapTokens: number;
  rows: AllocationSummaryRow[];
};

/** An activated account is active itself and holds at least one active key. */
export function activeAccountCount(database: DatabaseHandle): number {
  const row = database
    .prepare(
      `SELECT COUNT(*) AS total FROM users u
       WHERE u.status = 'active'
         AND EXISTS (
           SELECT 1 FROM api_keys k
           WHERE k.user_id = u.id AND k.status = 'active'
         )`,
    )
    .get() as { total: number };

  return Math.max(0, row.total);
}

export function allocatedOn(database: DatabaseHandle, day: string): number {
  const row = database
    .prepare(
      "SELECT COALESCE(SUM(allocated_tokens), 0) AS total FROM free_pool_allocations WHERE day = ?",
    )
    .get(day) as { total: number };

  return Math.max(0, row.total);
}

function usedAndHeld(
  database: DatabaseHandle,
  userId: string,
  day: string,
  now: string,
) {
  const used = database
    .prepare(
      "SELECT COALESCE(weighted_tokens, 0) AS total FROM free_pool_usage WHERE user_id = ? AND day = ?",
    )
    .get(userId, day) as { total: number } | undefined;
  const held = database
    .prepare(
      `SELECT COALESCE(SUM(weighted_tokens), 0) AS total
       FROM free_pool_reservations
       WHERE user_id = ? AND expires_at > ?`,
    )
    .get(userId, now) as { total: number } | undefined;

  return {
    used: Math.max(0, used?.total ?? 0),
    held: Math.max(0, held?.total ?? 0),
  };
}

/**
 * Grants one account its share of today's allocatable pool. Call inside the
 * caller's immediate transaction: the active-account count, the day's already
 * allocated total, and the insert must agree.
 *
 * When a new activated account joins mid-day, existing grants above the new
 * fair share are lowered to it, but never below that account's recorded usage
 * plus in-flight holds. Without this, the first account of the day would keep
 * the entire allocatable pool and every later signup would receive zero.
 */
export function ensureAllocation(
  database: DatabaseHandle,
  input: {
    userId: string;
    day: string;
    config: AllocationConfig;
    now: string;
  },
): number {
  const allocatable = allocatableTokens(input.config);
  const accounts = activeAccountCount(database);
  const existing = database
    .prepare(
      "SELECT allocated_tokens FROM free_pool_allocations WHERE day = ? AND user_id = ?",
    )
    .get(input.day, input.userId) as { allocated_tokens: number } | undefined;

  if (existing) return Math.max(0, existing.allocated_tokens);

  const fairShare = accounts > 0 ? Math.floor(allocatable / accounts) : 0;
  const rows = database
    .prepare(
      "SELECT user_id, allocated_tokens FROM free_pool_allocations WHERE day = ?",
    )
    .all(input.day) as Array<{
    user_id: string;
    allocated_tokens: number;
  }>;
  const update = database.prepare(
    "UPDATE free_pool_allocations SET allocated_tokens = ? WHERE day = ? AND user_id = ?",
  );

  for (const row of rows) {
    const committed = usedAndHeld(database, row.user_id, input.day, input.now);
    const committedFloor = Math.min(
      row.allocated_tokens,
      committed.used + committed.held,
    );
    const rebalanced = Math.min(
      row.allocated_tokens,
      Math.max(fairShare, committedFloor),
    );

    if (rebalanced !== row.allocated_tokens) {
      update.run(rebalanced, input.day, row.user_id);
    }
  }

  const share = allocationShare({
    allocatableTokens: allocatable,
    activeAccounts: accounts,
    alreadyAllocated: allocatedOn(database, input.day),
  });

  database
    .prepare(
      "INSERT OR IGNORE INTO free_pool_allocations (day, user_id, allocated_tokens, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(input.day, input.userId, share, input.now);

  const inserted = database
    .prepare(
      "SELECT allocated_tokens FROM free_pool_allocations WHERE day = ? AND user_id = ?",
    )
    .get(input.day, input.userId) as { allocated_tokens: number } | undefined;

  return Math.max(0, inserted?.allocated_tokens ?? 0);
}

export function allocationSummary(
  database: DatabaseHandle,
  input: { day: string; config: AllocationConfig; now: string },
): AllocationSummary {
  const allocatable = allocatableTokens(input.config);
  const accounts = activeAccountCount(database);
  const rows = database
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
    .all(input.day, input.day, input.now) as Array<{
    user_id: string;
    email: string;
    name: string;
    allocated_tokens: number;
    used_tokens: number;
    held_tokens: number;
  }>;

  return {
    day: input.day,
    enabled: input.config.enabled,
    dailyPoolTokens: input.config.dailyPoolTokens,
    allocationBps: input.config.allocationBps,
    allocatableTokens: allocatable,
    reservedTokens: Math.max(0, input.config.dailyPoolTokens - allocatable),
    activeAccounts: accounts,
    allocatedTokens: rows.reduce(
      (total, row) => total + row.allocated_tokens,
      0,
    ),
    usedTokens: rows.reduce((total, row) => total + row.used_tokens, 0),
    perAccountTokens: accounts > 0 ? Math.floor(allocatable / accounts) : 0,
    effectivePerAccountTokens: accountDailyAllowance(
      input.config,
      accounts > 0 ? Math.floor(allocatable / accounts) : 0,
    ),
    accountDailyCapTokens: input.config.accountDailyCapTokens,
    rows: rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      name: row.name,
      allocatedTokens: row.allocated_tokens,
      usedTokens: row.used_tokens,
      heldTokens: row.held_tokens,
    })),
  };
}
