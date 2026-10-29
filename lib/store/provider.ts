import "server-only";

import type { ProviderStatus } from "../types";
import type { ProviderStatusInput } from "./shared";

import { db, nowIso } from "../db";

export function getProviderStatus(): ProviderStatus {
  const row = db.prepare("SELECT * FROM provider_status WHERE id = 1").get() as
    | {
        status: ProviderStatus["status"];
        balance_usd: number | null;
        rpm: number | null;
        rpm_plan: string | null;
        subscription_mode: string | null;
        subscription_plan: string | null;
        subscription_token_limit: number | null;
        subscription_tokens_used: number | null;
        subscription_tokens_remaining: number | null;
        subscription_allowed: number | null;
        subscription_expires_at: string | null;
        synced_at: string | null;
        error: string | null;
      }
    | undefined;

  const configured = Boolean(process.env.PROVIDER_KEY?.trim());

  return {
    configured,
    status: configured ? (row?.status ?? "unconfigured") : "unconfigured",
    balanceUsd: row?.balance_usd ?? null,
    rpm: row?.rpm ?? null,
    rpmPlan: row?.rpm_plan ?? null,
    subscriptionMode: row?.subscription_mode ?? null,
    subscriptionPlan: row?.subscription_plan ?? null,
    subscriptionTokenLimit: row?.subscription_token_limit ?? null,
    subscriptionTokensUsed: row?.subscription_tokens_used ?? null,
    subscriptionTokensRemaining: row?.subscription_tokens_remaining ?? null,
    subscriptionAllowed:
      row?.subscription_allowed == null ? null : row.subscription_allowed === 1,
    subscriptionExpiresAt: row?.subscription_expires_at ?? null,
    syncedAt: row?.synced_at ?? null,
    error: row?.error ?? null,
  };
}

export function saveProviderStatus(input: ProviderStatusInput) {
  db.prepare(
    `INSERT INTO provider_status
      (id, status, balance_usd, rpm, rpm_plan, subscription_mode, subscription_plan,
       subscription_token_limit, subscription_tokens_used, subscription_tokens_remaining,
       subscription_allowed, subscription_expires_at, synced_at, error)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       balance_usd = excluded.balance_usd,
       rpm = excluded.rpm,
       rpm_plan = excluded.rpm_plan,
       subscription_mode = excluded.subscription_mode,
       subscription_plan = excluded.subscription_plan,
       subscription_token_limit = excluded.subscription_token_limit,
       subscription_tokens_used = excluded.subscription_tokens_used,
       subscription_tokens_remaining = excluded.subscription_tokens_remaining,
       subscription_allowed = excluded.subscription_allowed,
       subscription_expires_at = excluded.subscription_expires_at,
       synced_at = excluded.synced_at,
       error = excluded.error`,
  ).run(
    input.status,
    input.balanceUsd,
    input.rpm,
    input.rpmPlan,
    input.subscriptionMode,
    input.subscriptionPlan,
    input.subscriptionTokenLimit,
    input.subscriptionTokensUsed,
    input.subscriptionTokensRemaining,
    input.subscriptionAllowed == null
      ? null
      : input.subscriptionAllowed
        ? 1
        : 0,
    input.subscriptionExpiresAt,
    nowIso(),
    input.error,
  );
}
