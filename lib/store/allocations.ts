import "server-only";

import type { AllocationConfig } from "../allocation";
import type { AllocationSummary } from "../allocation-ledger";

import {
  clampAllocationBps,
  observedDailyPool,
  readAllocationConfig,
} from "../allocation";
import { allocationSummary, ensureAllocation } from "../allocation-ledger";
import { db, nowIso } from "../db";
import { nextUtcReset } from "../free-pool";
import { quotaIsCurrent } from "../provider-quota";

import { getSetting, saveSetting } from "./settings";
import { getProviderStatusBySlug } from "./providers";

export type {
  AllocationSummary,
  AllocationSummaryRow,
} from "../allocation-ledger";

const DAILY_KEY = "free_pool.daily_tokens";
const BPS_KEY = "free_pool.allocation_bps";
const ENABLED_KEY = "free_pool.allocation_enabled";
const ACCOUNT_CAP_KEY = "free_pool.account_daily_cap";

function settingNumber(key: string, fallback: number): number {
  const raw = getSetting(key);

  if (raw === null || raw.trim() === "") return fallback;

  const parsed = Number(raw);

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Settings written from Admin → Gateway override the environment defaults. The
 * environment stays the source of truth for a fresh install.
 */
export function getAllocationConfig(): AllocationConfig {
  const env = readAllocationConfig();
  const enabled = getSetting(ENABLED_KEY);

  return {
    enabled: enabled === null ? env.enabled : enabled === "true",
    dailyPoolTokens: settingNumber(DAILY_KEY, env.dailyPoolTokens),
    allocationBps: clampAllocationBps(
      settingNumber(BPS_KEY, env.allocationBps),
    ),
    accountDailyCapTokens: settingNumber(
      ACCOUNT_CAP_KEY,
      env.accountDailyCapTokens,
    ),
  };
}

export function saveAllocationConfig(input: {
  enabled?: boolean;
  dailyPoolTokens?: number;
  allocationBps?: number;
  accountDailyCapTokens?: number;
}): AllocationConfig {
  if (typeof input.enabled === "boolean") {
    saveSetting(ENABLED_KEY, input.enabled ? "true" : "false");
  }

  if (input.dailyPoolTokens !== undefined) {
    saveSetting(
      DAILY_KEY,
      String(Math.max(0, Math.floor(input.dailyPoolTokens))),
    );
  }

  if (input.allocationBps !== undefined) {
    saveSetting(BPS_KEY, String(clampAllocationBps(input.allocationBps)));
  }

  if (input.accountDailyCapTokens !== undefined) {
    saveSetting(
      ACCOUNT_CAP_KEY,
      String(Math.max(0, Math.floor(input.accountDailyCapTokens))),
    );
  }

  return getAllocationConfig();
}

export function getObservedAllocationConfig(
  providerSlug = "savant",
): AllocationConfig {
  const config = getAllocationConfig();
  const status = getProviderStatusBySlug(providerSlug);
  const now = Date.now();
  const current =
    quotaIsCurrent(status, now) &&
    status.subscriptionMode === "free" &&
    status.quota.resetsAt === nextUtcReset(now).toISOString();
  const row = current
    ? (db
        .prepare(
          `SELECT COALESCE(SUM(weighted_tokens), 0) AS used
    FROM usage_events WHERE provider_slug = ? AND created_at >= ? AND created_at < ?`,
        )
        .get(
          providerSlug,
          new Date(now).toISOString().slice(0, 10),
          status.quota.observedAt,
        ) as { used: number })
    : null;

  return {
    ...config,
    dailyPoolTokens: current
      ? observedDailyPool({
          configured: config.dailyPoolTokens,
          limit: status.subscriptionTokenLimit,
          remaining: status.subscriptionTokensRemaining,
          localUsedBeforeObservation: row?.used ?? 0,
          unlimited: status.quota.unlimited,
        })
      : 0,
  };
}

export function ensureDailyAllocation(
  userId: string,
  day: string,
  providerSlug = "savant",
): number {
  return ensureAllocation(db, {
    userId,
    day,
    config: getObservedAllocationConfig(providerSlug),
    now: nowIso(),
  });
}

export function getAllocationSummary(day: string): AllocationSummary {
  const status = getProviderStatusBySlug("savant");

  return {
    ...allocationSummary(db, {
      day,
      config: getObservedAllocationConfig(),
      now: nowIso(),
    }),
    configuredDailyPoolTokens: getAllocationConfig().dailyPoolTokens,
    capacityAvailable:
      quotaIsCurrent(status) && status.subscriptionAllowed === true,
  };
}
