import type { DatabaseHandle } from "./schema/columns.ts";
import type {
  ProviderBalance,
  ProviderSubscription,
} from "./provider-quota.ts";

import { RUNTIME_LEASE_MS } from "./provider-quota.ts";

/** Leases have an owner and deadline: late responses cannot overwrite a check. */
export function claimRuntimeLease(
  db: DatabaseHandle,
  input: {
    slug: string;
    id: string;
    at: string;
  },
) {
  return (
    db
      .prepare(
        `UPDATE providers
    SET runtime_lease_id = ?, runtime_lease_until = ?,
        quota_observed_at = NULL, balance_observed_at = NULL
    WHERE slug = ? AND enabled = 1 AND
      (runtime_lease_until IS NULL OR runtime_lease_until <= ?)`,
      )
      .run(
        input.id,
        new Date(Date.parse(input.at) + RUNTIME_LEASE_MS).toISOString(),
        input.slug,
        input.at,
      ).changes === 1
  );
}

export function completeRuntimeCheck(
  db: DatabaseHandle,
  input: {
    slug: string;
    id: string;
    startedAt: string;
    checkedAt: string;
    balance: ProviderBalance | null;
    subscription: ProviderSubscription | null;
    quotaError: string | null;
    error: string | null;
  },
) {
  const { balance, subscription } = input;
  const status = input.error
    ? "error"
    : subscription?.allowed === false || balance?.limitReached
      ? "exhausted"
      : "active";

  return (
    db
      .prepare(
        `UPDATE providers SET
    status = ?, balance_usd = ?, rpm = ?, rpm_plan = ?, balance_observed_at = ?,
    subscription_mode = ?, subscription_plan = ?, subscription_token_limit = ?,
    subscription_tokens_used = ?, subscription_tokens_remaining = ?,
    subscription_allowed = ?, subscription_expires_at = ?,
    quota_observed_at = ?, quota_checked_at = ?, quota_reset_at = ?,
    quota_unlimited = ?, quota_error = ?, error = ?,
    runtime_lease_id = NULL, runtime_lease_until = NULL
    WHERE slug = ? AND runtime_lease_id = ? AND runtime_lease_until > ?`,
      )
      .run(
        status,
        balance?.balanceUsd ?? null,
        balance?.rpm ?? null,
        balance?.rpmPlan ?? null,
        balance ? input.startedAt : null,
        subscription?.mode ?? null,
        subscription?.plan ?? null,
        subscription?.tokenLimit ?? null,
        subscription?.tokensUsed ?? null,
        subscription?.tokensRemaining ?? null,
        subscription ? (subscription.allowed ? 1 : 0) : null,
        subscription?.expiresAt ?? null,
        subscription ? input.startedAt : null,
        input.checkedAt,
        subscription?.resetsAt ?? null,
        subscription?.unlimited ? 1 : 0,
        input.quotaError,
        input.error,
        input.slug,
        input.id,
        input.checkedAt,
      ).changes === 1
  );
}

/** The upstream observation is separate from this conservative local estimate. */
export function effectiveProviderRemaining(
  db: DatabaseHandle,
  input: {
    slug: string;
    remaining: number | null;
    observedAt: string | null;
    at: string;
  },
) {
  if (input.remaining === null || input.observedAt === null) return null;

  const row = db
    .prepare(
      `SELECT
    (SELECT COALESCE(SUM(weighted_tokens), 0) FROM usage_events
     WHERE provider_slug = ? AND created_at >= ? AND weighted_tokens > 0) AS used,
    (SELECT COALESCE(SUM(weighted_tokens), 0) FROM free_pool_reservations
     WHERE provider_slug = ? AND expires_at > ?) AS held`,
    )
    .get(input.slug, input.observedAt, input.slug, input.at) as {
    used: number;
    held: number;
  };

  return Math.max(0, Math.floor(input.remaining - row.used - row.held));
}
