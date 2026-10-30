import "server-only";

import type {
  ProviderKind,
  ProviderRecord,
  ProviderSummary,
} from "../providers/types";
import type { ProviderStatus } from "../types";

import { db, nowIso } from "../db";
import { observationIsRecent, quotaIsCurrent } from "../provider-quota";
import { effectiveProviderRemaining } from "../quota-ledger";
import {
  DEFAULT_PROVIDER_SLUG,
  providerKeyConfigured,
  type ProviderInput,
} from "../providers/registry";

type ProviderRow = {
  slug: string;
  label: string;
  kind: ProviderKind;
  base_url: string;
  key_env_var: string;
  default_headers: string;
  supports_balance: number;
  supports_subscription: number;
  supports_pricing: number;
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

function parseHeaders(raw: string) {
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

function toRecord(row: ProviderRow): ProviderRecord {
  return {
    slug: row.slug,
    label: row.label,
    kind: row.kind,
    baseUrl: row.base_url,
    keyEnvVar: row.key_env_var,
    defaultHeaders: parseHeaders(row.default_headers),
    capabilities: {
      balance: row.supports_balance === 1,
      subscription: row.supports_subscription === 1,
      pricing: row.supports_pricing === 1,
    },
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStatus(row: ProviderRow): ProviderStatus {
  const configured = providerKeyConfigured(row.key_env_var);
  const now = Date.now();
  const quota = {
    observedAt: row.quota_observed_at,
    checkedAt: row.quota_checked_at,
    resetsAt: row.quota_reset_at,
    unlimited: row.quota_unlimited === 1,
    error: row.quota_error,
    checking:
      !!row.runtime_lease_until && Date.parse(row.runtime_lease_until) > now,
  };
  const current =
    configured &&
    row.enabled === 1 &&
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
    row.enabled === 1 &&
    !quota.checking &&
    observationIsRecent(row.balance_observed_at, now);

  return {
    quota,
    balanceObservedAt: row.balance_observed_at,
    admissionRemainingTokens: current
      ? effectiveProviderRemaining(db, {
          slug: row.slug,
          remaining: row.subscription_tokens_remaining,
          observedAt: row.quota_observed_at,
          at: new Date(now).toISOString(),
        })
      : null,
    configured,
    status: !configured
      ? "unconfigured"
      : row.supports_subscription === 1 && !current
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
        : row.subscription_allowed === 1,
    subscriptionExpiresAt: row.subscription_expires_at,
    syncedAt: row.synced_at,
    error: row.error,
  };
}

export function getProviderRow(slug: string) {
  return db.prepare("SELECT * FROM providers WHERE slug = ?").get(slug) as
    ProviderRow | undefined;
}

export function getProvider(slug: string): ProviderRecord | undefined {
  const row = getProviderRow(slug);

  return row ? toRecord(row) : undefined;
}

export function listProviderRecords(): ProviderRecord[] {
  const rows = db
    .prepare("SELECT * FROM providers ORDER BY sort_order ASC, label ASC")
    .all() as ProviderRow[];

  return rows.map(toRecord);
}

export function getDefaultProvider() {
  return (
    getProvider(DEFAULT_PROVIDER_SLUG) ??
    listProviderRecords().find((provider) => provider.enabled)
  );
}

export function getProviderStatusBySlug(slug: string): ProviderStatus {
  const row = getProviderRow(slug);

  return row ? toStatus(row) : toStatus(emptyRow(slug));
}

function emptyRow(slug: string): ProviderRow {
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

function modelCount(slug: string) {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS total FROM models WHERE upstream_slug = ? AND in_catalog = 1",
    )
    .get(slug) as { total: number };

  return row.total;
}

export function listProviders(): ProviderSummary[] {
  return listProviderRecords().map((provider) => {
    const row = getProviderRow(provider.slug);

    return {
      ...provider,
      ...(row ? toStatus(row) : toStatus(emptyRow(provider.slug))),
      modelCount: modelCount(provider.slug),
    };
  });
}

export function createProvider(input: ProviderInput) {
  const now = nowIso();

  db.prepare(
    `INSERT INTO providers
      (slug, label, kind, base_url, key_env_var, default_headers,
       supports_balance, supports_subscription, supports_pricing, enabled,
       sort_order, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unconfigured', ?, ?)`,
  ).run(
    input.slug,
    input.label,
    input.kind,
    input.baseUrl,
    input.keyEnvVar,
    JSON.stringify(input.defaultHeaders),
    input.capabilities.balance ? 1 : 0,
    input.capabilities.subscription ? 1 : 0,
    input.capabilities.pricing ? 1 : 0,
    input.enabled ? 1 : 0,
    input.sortOrder,
    now,
    now,
  );

  return getProvider(input.slug);
}

export function updateProvider(slug: string, input: ProviderInput) {
  const result = db
    .prepare(
      `UPDATE providers
       SET label = ?, kind = ?, base_url = ?, key_env_var = ?,
           default_headers = ?, supports_balance = ?,
           supports_subscription = ?, supports_pricing = ?, enabled = ?,
           sort_order = ?, updated_at = ?,
           quota_observed_at = NULL, balance_observed_at = NULL,
           runtime_lease_id = NULL, runtime_lease_until = NULL
       WHERE slug = ?`,
    )
    .run(
      input.label,
      input.kind,
      input.baseUrl,
      input.keyEnvVar,
      JSON.stringify(input.defaultHeaders),
      input.capabilities.balance ? 1 : 0,
      input.capabilities.subscription ? 1 : 0,
      input.capabilities.pricing ? 1 : 0,
      input.enabled ? 1 : 0,
      input.sortOrder,
      nowIso(),
      slug,
    );

  return result.changes > 0 ? getProvider(slug) : undefined;
}

export function setProviderEnabled(slug: string, enabled: boolean) {
  const result = db
    .prepare(
      `UPDATE providers SET enabled = ?, updated_at = ?,
      quota_observed_at = NULL, balance_observed_at = NULL,
      runtime_lease_id = NULL, runtime_lease_until = NULL WHERE slug = ?`,
    )
    .run(enabled ? 1 : 0, nowIso(), slug);

  return result.changes > 0;
}

/**
 * Removes a non-default provider and its catalog rows in one transaction.
 * Usage history keeps its `model_id` strings and is not rewritten; analytics
 * already left-joins models. The default provider cannot be deleted.
 */
export function deleteProvider(slug: string) {
  if (slug === DEFAULT_PROVIDER_SLUG) return false;

  return db
    .transaction(() => {
      db.prepare("DELETE FROM models WHERE upstream_slug = ?").run(slug);

      return (
        db.prepare("DELETE FROM providers WHERE slug = ?").run(slug).changes > 0
      );
    })
    .immediate();
}

export function saveProviderCatalogSync(slug: string) {
  db.prepare("UPDATE providers SET synced_at = ? WHERE slug = ?").run(
    nowIso(),
    slug,
  );
}
