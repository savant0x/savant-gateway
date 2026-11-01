import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  AdminOverview,
  CatalogData,
  LandingData,
  Overview,
  OverviewStats,
  PublicProviderStatus,
} from "../../types.ts";

import { ensureProvidersFresh } from "../providers/freshness.ts";

import { PUBLIC_MODEL_SCOPE } from "./model-sql.ts";
import { getAccountSummary, listCreditLedger } from "./billing.ts";
import { listModels } from "./catalog.ts";
import { listApiKeys } from "./keys.ts";
import { listAllModels } from "./models.ts";
import { getPricingSummary } from "./pricing.ts";
import { getProviderStatusBySlug } from "./providers.ts";
import { listAdminUsage, listUsage } from "./usage.ts";

/**
 * Overview read models, ported to the async handle (FID-086, Batch B).
 *
 * The counts are deliberately one statement: seven independent `SELECT COUNT(*)`
 * round trips would give a page whose sections were measured at seven different
 * moments, and a catalog count that disagrees with the list rendered beside it is
 * the kind of discrepancy operators report as a bug.
 *
 * `refresh` is a parameter, not an import. The live refresher
 * (`lib/provider-sync.ts` → `lib/providers/sync.ts`) imports `server-only`, so
 * importing it here would make this module unloadable by the test runner. The
 * caller supplies it; without it the page renders stored rows, which is what the
 * stale-while-revalidate contract already promised.
 */

const DEFAULT_PROVIDER_SLUG = "savant";

export async function getOverviewStats(
  db: PostgresDatabase,
): Promise<OverviewStats> {
  const row = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM models m
         JOIN providers p ON p.slug = m.upstream_slug AND p.enabled = 1
         JOIN model_groups g ON g.slug = m.group_slug
         WHERE ${PUBLIC_MODEL_SCOPE}) AS model_count,
        (SELECT COUNT(*) FROM models m
         JOIN providers p ON p.slug = m.upstream_slug AND p.enabled = 1
         JOIN model_groups g ON g.slug = m.group_slug
         WHERE ${PUBLIC_MODEL_SCOPE}
           AND g.billing_mode = 'free') AS free_model_count,
        (SELECT COUNT(*) FROM models m
         JOIN providers p ON p.slug = m.upstream_slug AND p.enabled = 1
         JOIN model_groups g ON g.slug = m.group_slug
         WHERE ${PUBLIC_MODEL_SCOPE}
           AND g.billing_mode = 'paid') AS paid_model_count,
        (SELECT COUNT(*) FROM models m
         JOIN providers p ON p.slug = m.upstream_slug AND p.enabled = 1
         JOIN model_groups g ON g.slug = m.group_slug
         WHERE ${PUBLIC_MODEL_SCOPE}
           AND g.billing_mode = 'subscription') AS subscription_model_count,
        (SELECT COUNT(*) FROM api_keys WHERE status = 'active') AS key_count,
        (SELECT COUNT(*) FROM usage_events) AS request_count,
        (SELECT COALESCE(SUM(input_tokens + output_tokens), 0)
         FROM usage_events) AS total_tokens`,
    )
    .get<{
      model_count: number | string;
      free_model_count: number | string;
      paid_model_count: number | string;
      subscription_model_count: number | string;
      key_count: number | string;
      request_count: number | string;
      total_tokens: number | string;
    }>();

  return {
    modelCount: Number(row?.model_count ?? 0),
    freeModelCount: Number(row?.free_model_count ?? 0),
    paidModelCount: Number(row?.paid_model_count ?? 0),
    subscriptionModelCount: Number(row?.subscription_model_count ?? 0),
    keyCount: Number(row?.key_count ?? 0),
    requestCount: Number(row?.request_count ?? 0),
    totalTokens: Number(row?.total_tokens ?? 0),
  };
}

function toPublicProvider(
  provider: Awaited<ReturnType<typeof getProviderStatusBySlug>>,
): PublicProviderStatus {
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

export async function getOverview(db: PostgresDatabase): Promise<Overview> {
  const provider = await getProviderStatusBySlug(db, DEFAULT_PROVIDER_SLUG);

  return {
    provider,
    account: await getAccountSummary(db),
    models: await listModels(db),
    keys: await listApiKeys(db),
    usage: await listUsage(db, 25),
    stats: await getOverviewStats(db),
  };
}

/** Stale-while-revalidate: a stale catalog refreshes behind the render. */
export async function getLandingData(
  db: PostgresDatabase,
  sync?: (slug: string) => Promise<unknown>,
): Promise<LandingData> {
  ensureProvidersFresh(db, { sync });

  return {
    provider: toPublicProvider(
      await getProviderStatusBySlug(db, DEFAULT_PROVIDER_SLUG),
    ),
    models: await listModels(db),
    stats: await getOverviewStats(db),
  };
}

export async function getCatalogData(
  db: PostgresDatabase,
  sync?: (slug: string) => Promise<unknown>,
): Promise<CatalogData> {
  ensureProvidersFresh(db, { sync });

  return {
    models: await listModels(db),
    stats: await getOverviewStats(db),
    provider: toPublicProvider(
      await getProviderStatusBySlug(db, DEFAULT_PROVIDER_SLUG),
    ),
  };
}

export async function getAdminOverview(
  db: PostgresDatabase,
): Promise<AdminOverview> {
  const models = await listAllModels(db);

  return {
    provider: await getProviderStatusBySlug(db, DEFAULT_PROVIDER_SLUG),
    account: await getAccountSummary(db),
    models,
    keys: await listApiKeys(db),
    usage: await listAdminUsage(db, 25),
    stats: await getOverviewStats(db),
    pricing: await getPricingSummary(db, models),
    ledger: await listCreditLedger(db, 10),
  };
}
