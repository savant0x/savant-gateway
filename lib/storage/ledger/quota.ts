import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  ProviderBalance,
  ProviderSubscription,
} from "../../provider-quota.ts";

import { RUNTIME_LEASE_MS } from "../../provider-quota.ts";

/**
 * Provider runtime ledger, ported to the async handle (FID-086, Batch B).
 *
 * A quota check is a read of someone else's account followed by a write to
 * ours, so the write has to prove it still owns the check. The lease does that
 * with a conditional update rather than a lock: claiming is
 * `WHERE runtime_lease_until IS NULL OR runtime_lease_until <= now`, and
 * completing is `WHERE runtime_lease_id = ? AND runtime_lease_until > ?`. A
 * response that arrives after another check took over therefore writes nothing
 * instead of overwriting a newer observation with an older one.
 *
 * Claiming clears `quota_observed_at` and `balance_observed_at`. That is
 * deliberate: while a check is in flight the stored observation is not evidence,
 * so `quotaIsCurrent` must see it as stale rather than serving the previous
 * numbers as if they had just been confirmed.
 *
 * Timestamps stay ISO-8601 text (D-13), including the lease comparisons: for
 * that format lexicographic order is chronological order, and both sides come
 * from the same serializer.
 */

export async function claimRuntimeLease(
  db: PostgresDatabase,
  input: { slug: string; id: string; at: string },
) {
  const result = await db
    .prepare(
      `UPDATE providers
          SET runtime_lease_id = ?, runtime_lease_until = ?,
              quota_observed_at = NULL, balance_observed_at = NULL
        WHERE slug = ? AND enabled = 1
          AND (runtime_lease_until IS NULL OR runtime_lease_until <= ?)`,
    )
    .run(
      input.id,
      new Date(Date.parse(input.at) + RUNTIME_LEASE_MS).toISOString(),
      input.slug,
      input.at,
    );

  return result.changes === 1;
}

export async function completeRuntimeCheck(
  db: PostgresDatabase,
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

  const result = await db
    .prepare(
      `UPDATE providers SET
        status = ?, balance_usd = ?, rpm = ?, rpm_plan = ?,
        balance_observed_at = ?, subscription_mode = ?, subscription_plan = ?,
        subscription_token_limit = ?, subscription_tokens_used = ?,
        subscription_tokens_remaining = ?, subscription_allowed = ?,
        subscription_expires_at = ?, quota_observed_at = ?,
        quota_checked_at = ?, quota_reset_at = ?, quota_unlimited = ?,
        quota_error = ?, error = ?,
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
    );

  return result.changes === 1;
}
