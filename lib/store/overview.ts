import "server-only";

import type {
  AdminOverview,
  CatalogData,
  LandingData,
  ModelSummary,
  Overview,
  OverviewStats,
  PublicProviderStatus,
} from "../types";

import { db } from "../db";

import { getAccountSummary, listCreditLedger } from "./billing";
import { listApiKeys } from "./keys";
import { listAllModels, listModels } from "./models";
import { summarizePricing } from "./pricing";
import { getProviderStatus } from "./provider";
import { listAdminUsage, listUsage } from "./usage";

export function getOverviewStats(): OverviewStats {
  const row = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM models m
         JOIN providers p ON p.slug = m.upstream_slug AND p.enabled = 1
         JOIN model_groups g ON g.slug = m.group_slug
         WHERE m.in_catalog = 1 AND m.status = 'active') AS model_count,
        (SELECT COUNT(*) FROM models m
         JOIN providers p ON p.slug = m.upstream_slug AND p.enabled = 1
         JOIN model_groups g ON g.slug = m.group_slug
         WHERE m.in_catalog = 1 AND m.status = 'active'
           AND g.billing_mode = 'free') AS free_model_count,
        (SELECT COUNT(*) FROM models m
         JOIN providers p ON p.slug = m.upstream_slug AND p.enabled = 1
         JOIN model_groups g ON g.slug = m.group_slug
         WHERE m.in_catalog = 1 AND m.status = 'active'
           AND g.billing_mode = 'paid') AS paid_model_count,
        (SELECT COUNT(*) FROM models m
         JOIN providers p ON p.slug = m.upstream_slug AND p.enabled = 1
         JOIN model_groups g ON g.slug = m.group_slug
         WHERE m.in_catalog = 1 AND m.status = 'active'
           AND g.billing_mode = 'subscription') AS subscription_model_count,
        (SELECT COUNT(*) FROM api_keys WHERE status = 'active') AS key_count,
        (SELECT COUNT(*) FROM usage_events) AS request_count,
        (SELECT COALESCE(SUM(input_tokens + output_tokens), 0)
         FROM usage_events) AS total_tokens`,
    )
    .get() as {
    model_count: number;
    free_model_count: number;
    paid_model_count: number;
    subscription_model_count: number;
    key_count: number;
    request_count: number;
    total_tokens: number;
  };

  return {
    modelCount: row.model_count,
    freeModelCount: row.free_model_count,
    paidModelCount: row.paid_model_count,
    subscriptionModelCount: row.subscription_model_count,
    keyCount: row.key_count,
    requestCount: row.request_count,
    totalTokens: row.total_tokens,
  };
}

export function getOverview(): Overview {
  return {
    provider: getProviderStatus(),
    account: getAccountSummary(),
    models: listModels(),
    keys: listApiKeys(),
    usage: listUsage(25),
    stats: getOverviewStats(),
  };
}

function toPublicProvider(): PublicProviderStatus {
  const provider = getProviderStatus();

  return {
    configured: provider.configured,
    status: provider.status,
    subscriptionMode: provider.subscriptionMode,
    subscriptionTokenLimit: provider.subscriptionTokenLimit,
    subscriptionTokensUsed: provider.subscriptionTokensUsed,
    subscriptionTokensRemaining: provider.subscriptionTokensRemaining,
    syncedAt: provider.syncedAt,
  };
}

function previewModels(models: ModelSummary[]) {
  const free = models.filter((model) => model.access === "free").slice(0, 2);
  const paid = models.filter((model) => model.access === "paid").slice(0, 4);

  return [...paid, ...free];
}

export function getLandingData(): LandingData {
  const models = listModels();

  return {
    provider: toPublicProvider(),
    models: previewModels(models),
    stats: getOverviewStats(),
  };
}

export function getCatalogData(): CatalogData {
  return {
    models: listModels(),
    stats: getOverviewStats(),
    provider: toPublicProvider(),
  };
}

export function getAdminOverview(): AdminOverview {
  const models = listAllModels();

  return {
    provider: getProviderStatus(),
    account: getAccountSummary(),
    models,
    keys: listApiKeys(),
    usage: listAdminUsage(25),
    stats: getOverviewStats(),
    pricing: summarizePricing(models),
    ledger: listCreditLedger(10),
  };
}
