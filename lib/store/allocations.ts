import "server-only";

import type { AllocationConfig } from "../allocation";
import type { AllocationSummary } from "../allocation-ledger";

import { clampAllocationBps, readAllocationConfig } from "../allocation";
import { allocationSummary, ensureAllocation } from "../allocation-ledger";
import { db, nowIso } from "../db";

import { getSetting, saveSetting } from "./settings";

export type {
  AllocationSummary,
  AllocationSummaryRow,
} from "../allocation-ledger";

const DAILY_KEY = "free_pool.daily_tokens";
const BPS_KEY = "free_pool.allocation_bps";
const ENABLED_KEY = "free_pool.allocation_enabled";

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
  };
}

export function saveAllocationConfig(input: {
  enabled?: boolean;
  dailyPoolTokens?: number;
  allocationBps?: number;
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

  return getAllocationConfig();
}

export function ensureDailyAllocation(userId: string, day: string): number {
  return ensureAllocation(db, {
    userId,
    day,
    config: getAllocationConfig(),
    now: nowIso(),
  });
}

export function getAllocationSummary(day: string): AllocationSummary {
  return allocationSummary(db, {
    day,
    config: getAllocationConfig(),
    now: nowIso(),
  });
}
