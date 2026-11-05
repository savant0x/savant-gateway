import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ProviderKind, ProviderRecord } from "../../providers/types.ts";
import type { ProviderStatus } from "../../types.ts";

import { observationIsRecent, quotaIsCurrent } from "../../provider-quota.ts";
import { providerKeyConfigured } from "../../providers/registry.ts";

import { effectiveProviderRemaining } from "./quota.ts";

/**
 * Provider row mapping and status derivation, split from `./providers.ts`.
 *
 * The split is the 400-line ceiling, and it separates two jobs that were
 * tangled: `providers.ts` owns the registry (list, create, update, enable,
 * delete), while this module owns how a stored row becomes a record or a status.
 *
 * The status rules are admission rules, not presentation: a provider with no key
 * configured reports `unconfigured` and never inherits a stale balance, a stale
 * quota observation hides its subscription numbers, and a provider that claims
 * subscription support without a current quota reports `error` rather than
 * looking healthy. `toStatus` is asynchronous because it consults the quota
 * ledger; splitting the pure part out would have duplicated that admission logic
 * in two places.
 */

export type ProviderRow = {
  slug: string;
  label: string;
  kind: ProviderKind;
  base_url: string;
  key_env_var: string;
  default_headers: string;
  supports_balance: number;
  supports_subscription: number;
  supports_pricing: number;
  requires_model_review: number;
  enabled: number;
  sort_order: number;
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
  created_at: string;
  updated_at: string;
  balance_observed_at: string | null;
  quota_observed_at: string | null;
  quota_checked_at: string | null;
  quota_reset_at: string | null;
  quota_unlimited: number;
  quota_error: string | null;
  runtime_lease_until: string | null;
};

export function parseHeaders(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        )
        .map(([key, value]) => [key, value]),
    );
  } catch {
    return {};
  }
}

export function toRecord(row: ProviderRow): ProviderRecord {
  return {
    slug: row.slug,
    label: row.label,
    kind: row.kind,
    baseUrl: row.base_url,
    keyEnvVar: row.key_env_var,
    defaultHeaders: parseHeaders(row.default_headers),
    capabilities: {
      balance: Number(row.supports_balance) === 1,
      subscription: Number(row.supports_subscription) === 1,
      pricing: Number(row.supports_pricing) === 1,
    },
    requiresModelReview: Number(row.requires_model_review) === 1,
    enabled: Number(row.enabled) === 1,
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function toStatus(
  db: PostgresDatabase,
  row: ProviderRow,
  now = Date.now(),
): Promise<ProviderStatus> {
  const configured =
    row.key_env_var !== "" && providerKeyConfigured(row.key_env_var);
  const quota = {
    observedAt: row.quota_observed_at,
    checkedAt: row.quota_checked_at,
    resetsAt: row.quota_reset_at,
    unlimited: Number(row.quota_unlimited) === 1,
    error: row.quota_error,
    checking:
      !!row.runtime_lease_until && Date.parse(row.runtime_lease_until) > now,
  };
  const current =
    configured &&
    Number(row.enabled) === 1 &&
    quotaIsCurrent(
      {
        quota,
        subscriptionMode: row.subscription_mode,
        subscriptionExpiresAt: row.subscription_expires_at,
      },
      now,
    );
  const balanceCurrent =
    configured &&
    Number(row.enabled) === 1 &&
    !quota.checking &&
    observationIsRecent(row.balance_observed_at, now);

  return {
    quota,
    balanceObservedAt: row.balance_observed_at,
    admissionRemainingTokens: current
      ? await effectiveProviderRemaining(db, {
          slug: row.slug,
          remaining: row.subscription_tokens_remaining,
          observedAt: row.quota_observed_at,
          at: new Date(now).toISOString(),
        })
      : null,
    configured,
    status: !configured
      ? "unconfigured"
      : Number(row.supports_subscription) === 1 && !current
        ? "error"
        : row.status,
    balanceUsd: balanceCurrent ? row.balance_usd : null,
    rpm: balanceCurrent ? row.rpm : null,
    rpmPlan: balanceCurrent ? row.rpm_plan : null,
    subscriptionMode: row.subscription_mode,
    subscriptionPlan: current ? row.subscription_plan : null,
    subscriptionTokenLimit: current ? row.subscription_token_limit : null,
    subscriptionTokensUsed: current ? row.subscription_tokens_used : null,
    subscriptionTokensRemaining: current
      ? row.subscription_tokens_remaining
      : null,
    subscriptionAllowed:
      !current || row.subscription_allowed == null
        ? null
        : Number(row.subscription_allowed) === 1,
    subscriptionExpiresAt: row.subscription_expires_at,
    syncedAt: row.synced_at,
    error: row.error,
  };
}

export function emptyRow(slug: string): ProviderRow {
  return {
    slug,
    label: slug,
    kind: "openai",
    base_url: "",
    key_env_var: "",
    default_headers: "{}",
    supports_balance: 0,
    supports_subscription: 0,
    supports_pricing: 0,
    requires_model_review: 0,
    enabled: 0,
    sort_order: 0,
    status: "unconfigured",
    balance_usd: null,
    rpm: null,
    rpm_plan: null,
    subscription_mode: null,
    subscription_plan: null,
    subscription_token_limit: null,
    subscription_tokens_used: null,
    subscription_tokens_remaining: null,
    subscription_allowed: null,
    subscription_expires_at: null,
    synced_at: null,
    error: null,
    created_at: "",
    updated_at: "",
    balance_observed_at: null,
    quota_observed_at: null,
    quota_checked_at: null,
    quota_reset_at: null,
    quota_unlimited: 0,
    quota_error: null,
    runtime_lease_until: null,
  };
}
