import type { PostgresDatabase } from "../pg-adapter.ts";
import type { AllocationConfig } from "../../allocation.ts";

import {
  clampAllocationBps,
  observedDailyPool,
  readAllocationConfig,
} from "../../allocation.ts";
import { nextUtcReset } from "../../free-pool.ts";
import { quotaIsCurrent } from "../../provider-quota.ts";
import { allocationSummary, ensureAllocation } from "../ledger/allocations.ts";

import { getProviderStatusBySlug } from "./providers.ts";
import { getSetting, saveSetting } from "./settings.ts";

export type {
  AllocationSummary,
  AllocationSummaryRow,
} from "../../allocation-ledger.ts";

/**
 * Allocation settings and summary, ported to the async handle (FID-086,
 * Batch B).
 *
 * Settings written from Admin → Gateway override the environment defaults; the
 * environment stays the source of truth for a fresh install. That precedence is
 * unchanged, but the four writes in `saveAllocationConfig` now share one
 * transaction: reading a half-saved policy would otherwise let a pool be enabled
 * with yesterday's cap for the width of one admin request.
 *
 * `getObservedAllocationConfig` is the interesting read. When the provider
 * reports a free subscription that is current and resets at the next UTC
 * boundary, the pool is derived from what the provider says is left rather than
 * from the configured number — an allowance the upstream no longer honours is
 * not an allowance.
 */

const DAILY_KEY = "free_pool.daily_tokens";
const BPS_KEY = "free_pool.allocation_bps";
const ENABLED_KEY = "free_pool.allocation_enabled";
const ACCOUNT_CAP_KEY = "free_pool.account_daily_cap";

async function settingNumber(
  db: PostgresDatabase,
  key: string,
  fallback: number,
) {
  const raw = await getSetting(db, key);

  if (raw === null || raw.trim() === "") return fallback;

  const parsed = Number(raw);

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function getAllocationConfig(
  db: PostgresDatabase,
): Promise<AllocationConfig> {
  const env = readAllocationConfig();
  const enabled = await getSetting(db, ENABLED_KEY);

  return {
    enabled: enabled === null ? env.enabled : enabled === "true",
    dailyPoolTokens: await settingNumber(db, DAILY_KEY, env.dailyPoolTokens),
    allocationBps: clampAllocationBps(
      await settingNumber(db, BPS_KEY, env.allocationBps),
    ),
    accountDailyCapTokens: await settingNumber(
      db,
      ACCOUNT_CAP_KEY,
      env.accountDailyCapTokens,
    ),
  };
}

export async function saveAllocationConfig(
  db: PostgresDatabase,
  input: {
    enabled?: boolean;
    dailyPoolTokens?: number;
    allocationBps?: number;
    accountDailyCapTokens?: number;
  },
): Promise<AllocationConfig> {
  await db
    .transaction(async () => {
      if (typeof input.enabled === "boolean") {
        await saveSetting(db, ENABLED_KEY, input.enabled ? "true" : "false");
      }

      if (input.dailyPoolTokens !== undefined) {
        await saveSetting(
          db,
          DAILY_KEY,
          String(Math.max(0, Math.floor(input.dailyPoolTokens))),
        );
      }

      if (input.allocationBps !== undefined) {
        await saveSetting(
          db,
          BPS_KEY,
          String(clampAllocationBps(input.allocationBps)),
        );
      }

      if (input.accountDailyCapTokens !== undefined) {
        await saveSetting(
          db,
          ACCOUNT_CAP_KEY,
          String(Math.max(0, Math.floor(input.accountDailyCapTokens))),
        );
      }
    })
    .immediate();

  return getAllocationConfig(db);
}

export async function getObservedAllocationConfig(
  db: PostgresDatabase,
  providerSlug = "savant",
): Promise<AllocationConfig> {
  const config = await getAllocationConfig(db);
  const status = await getProviderStatusBySlug(db, providerSlug);
  const now = Date.now();
  const current =
    quotaIsCurrent(status, now) &&
    status.subscriptionMode === "free" &&
    status.quota.resetsAt === nextUtcReset(now).toISOString();
  const row = current
    ? await db
        .prepare(
          `SELECT COALESCE(SUM(weighted_tokens), 0) AS used
             FROM usage_events
            WHERE provider_slug = ? AND created_at >= ? AND created_at < ?`,
        )
        .get<{ used: number | string }>(
          providerSlug,
          new Date(now).toISOString().slice(0, 10),
          status.quota.observedAt,
        )
    : null;

  return {
    ...config,
    dailyPoolTokens: current
      ? observedDailyPool({
          configured: config.dailyPoolTokens,
          limit: status.subscriptionTokenLimit,
          remaining: status.subscriptionTokensRemaining,
          localUsedBeforeObservation: Number(row?.used ?? 0),
          unlimited: status.quota.unlimited,
        })
      : 0,
  };
}

export async function ensureDailyAllocation(
  db: PostgresDatabase,
  userId: string,
  day: string,
  providerSlug = "savant",
): Promise<number> {
  return ensureAllocation(db, {
    userId,
    day,
    config: await getObservedAllocationConfig(db, providerSlug),
    now: new Date().toISOString(),
  });
}

export async function getAllocationSummary(
  db: PostgresDatabase,
  day: string,
  providerSlug = "savant",
) {
  const status = await getProviderStatusBySlug(db, providerSlug);
  const config = await getObservedAllocationConfig(db, providerSlug);

  return {
    ...(await allocationSummary(db, {
      day,
      config,
      now: new Date().toISOString(),
    })),
    configuredDailyPoolTokens: (await getAllocationConfig(db)).dailyPoolTokens,
    capacityAvailable:
      quotaIsCurrent(status) && status.subscriptionAllowed === true,
  };
}
