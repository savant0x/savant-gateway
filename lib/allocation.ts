/**
 * Daily shared free-pool allocation.
 *
 * The upstream free plan grants one weighted-token pool per UTC day for the
 * whole account. The gateway does not hand every customer that pool; it splits
 * a configured share of it evenly across activated accounts and holds the rest
 * back as a safety reserve. Allocations are integer weighted tokens and never
 * exceed the allocatable share, so adding accounts mid-day cannot oversell the
 * pool.
 */
export const DEFAULT_FREE_POOL_DAILY_TOKENS = 20_000_000;
export const DEFAULT_FREE_POOL_ALLOCATION_BPS = 9_000;
export const DEFAULT_FREE_POOL_ALLOCATION_ENABLED = true;
export const MAX_ALLOCATION_BPS = 10_000;

export type AllocationConfig = {
  enabled: boolean;
  dailyPoolTokens: number;
  allocationBps: number;
};

export type DailyAllocation = {
  day: string;
  allocatedTokens: number;
  usedTokens: number;
  heldTokens: number;
  remainingTokens: number;
};

function nonNegativeInt(value: unknown, fallback: number) {
  const parsed = Number(value);

  return value !== undefined &&
    value !== null &&
    value !== "" &&
    Number.isSafeInteger(parsed) &&
    parsed >= 0
    ? parsed
    : fallback;
}

export function clampAllocationBps(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return DEFAULT_FREE_POOL_ALLOCATION_BPS;

  return Math.min(MAX_ALLOCATION_BPS, Math.max(0, Math.round(parsed)));
}

export function readAllocationConfig(
  env: Record<string, string | undefined> = process.env,
): AllocationConfig {
  return {
    enabled:
      env.FREE_POOL_ALLOCATION_ENABLED === undefined ||
      env.FREE_POOL_ALLOCATION_ENABLED === ""
        ? DEFAULT_FREE_POOL_ALLOCATION_ENABLED
        : env.FREE_POOL_ALLOCATION_ENABLED === "true",
    dailyPoolTokens: nonNegativeInt(
      env.FREE_POOL_DAILY_WEIGHTED_TOKENS,
      DEFAULT_FREE_POOL_DAILY_TOKENS,
    ),
    allocationBps: clampAllocationBps(
      env.FREE_POOL_ALLOCATION_BPS === undefined ||
        env.FREE_POOL_ALLOCATION_BPS === ""
        ? DEFAULT_FREE_POOL_ALLOCATION_BPS
        : env.FREE_POOL_ALLOCATION_BPS,
    ),
  };
}

/** The part of the daily pool the gateway is willing to allocate at all. */
export function allocatableTokens(config: AllocationConfig): number {
  return Math.floor(
    (Math.max(0, config.dailyPoolTokens) * config.allocationBps) / 10_000,
  );
}

/**
 * One account's share. `alreadyAllocated` is every token already handed out
 * for the same UTC day, so a late account can only take what is left.
 */
export function allocationShare(input: {
  allocatableTokens: number;
  activeAccounts: number;
  alreadyAllocated: number;
}): number {
  const allocatable = Math.max(0, Math.floor(input.allocatableTokens));
  const accounts = Math.floor(input.activeAccounts);
  const allocated = Math.max(0, Math.floor(input.alreadyAllocated));

  if (accounts <= 0) return 0;

  const evenShare = Math.floor(allocatable / accounts);
  const unallocated = Math.max(0, allocatable - allocated);

  return Math.max(0, Math.min(evenShare, unallocated));
}

export function remainingAllocation(input: {
  allocatedTokens: number;
  usedTokens: number;
  heldTokens: number;
}): number {
  return Math.max(
    0,
    Math.max(0, input.allocatedTokens) -
      Math.max(0, input.usedTokens) -
      Math.max(0, input.heldTokens),
  );
}

export function formatAllocationMessage(input: {
  allocatedTokens: number;
  day: string;
  resetAt: string;
}) {
  return `Daily free-tier allocation reached (${input.allocatedTokens.toLocaleString("en-US")} weighted tokens for ${input.day}). Resets at ${input.resetAt}.`;
}
