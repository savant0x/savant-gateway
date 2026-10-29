import "server-only";

import type {
  ProviderKind,
  ProviderRecord,
  ProviderSummary,
} from "../providers/types";
import type { ProviderStatus } from "../types";

import { db, nowIso } from "../db";
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

  return {
    configured,
    status: configured ? row.status : "unconfigured",
    balanceUsd: row.balance_usd,
    rpm: row.rpm,
    rpmPlan: row.rpm_plan,
    subscriptionMode: row.subscription_mode,
    subscriptionPlan: row.subscription_plan,
    subscriptionTokenLimit: row.subscription_token_limit,
    subscriptionTokensUsed: row.subscription_tokens_used,
    subscriptionTokensRemaining: row.subscription_tokens_remaining,
    subscriptionAllowed:
      row.subscription_allowed == null ? null : row.subscription_allowed === 1,
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
           sort_order = ?, updated_at = ?
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
    .prepare("UPDATE providers SET enabled = ?, updated_at = ? WHERE slug = ?")
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

export function saveProviderRuntime(
  slug: string,
  input: {
    status: ProviderStatus["status"];
    balanceUsd: number | null;
    rpm: number | null;
    rpmPlan: string | null;
    subscriptionMode: string | null;
    subscriptionPlan: string | null;
    subscriptionTokenLimit: number | null;
    subscriptionTokensUsed: number | null;
    subscriptionTokensRemaining: number | null;
    subscriptionAllowed: boolean | null;
    subscriptionExpiresAt: string | null;
    error: string | null;
    /** Only a successful catalog read advances the remaining baseline. */
    syncedAt?: string;
  },
) {
  db.prepare(
    `UPDATE providers
     SET status = ?, balance_usd = ?, rpm = ?, rpm_plan = ?,
         subscription_mode = ?, subscription_plan = ?,
         subscription_token_limit = ?, subscription_tokens_used = ?,
         subscription_tokens_remaining = ?, subscription_allowed = ?,
         subscription_expires_at = ?, synced_at = COALESCE(?, synced_at),
         error = ?, updated_at = ?
     WHERE slug = ?`,
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
    input.syncedAt ?? null,
    input.error,
    nowIso(),
    slug,
  );
}
