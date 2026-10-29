import "server-only";

import type {
  ProviderRecord,
  ProviderSyncSummary,
  SyncAllSummary,
  UpstreamModel,
} from "./types";

import { replaceModels } from "../store/models";
import {
  getProvider,
  listProviderRecords,
  saveProviderRuntime,
} from "../store/providers";
import { getMarkupBps } from "../store/settings";

import { buildSyncedModels, type ModelSpec } from "./catalog";
import { providerKeyConfigured } from "./registry";
import {
  fetchProviderBalance,
  fetchProviderSubscription,
  providerFetch,
  readProviderError,
} from "./request";

const DEFAULT_PUBLIC_MODELS_URL = "https://apinex.bond/api/public/models";

async function fetchPublicMetadata() {
  const url =
    process.env.PROVIDER_PUBLIC_MODELS_URL?.trim() || DEFAULT_PUBLIC_MODELS_URL;
  const response = await fetch(url, {
    headers: { Accept: "application/json", src: "gate" },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);

  if (!response?.ok) return new Map<string, ModelSpec>();

  const payload = (await response.json()) as { models?: ModelSpec[] };
  const map = new Map<string, ModelSpec>();

  for (const item of payload.models ?? []) {
    const id = String(item.id ?? "").trim();

    if (id) map.set(id, item);
  }

  return map;
}

export async function fetchUpstreamModels(provider: ProviderRecord) {
  const response = await providerFetch(provider, "/models");

  if (!response.ok) throw new Error(await readProviderError(response));

  const payload = (await response.json()) as { data?: UpstreamModel[] };

  return Array.isArray(payload.data) ? payload.data : [];
}

function unconfiguredSummary(provider: ProviderRecord): ProviderSyncSummary {
  return {
    slug: provider.slug,
    imported: 0,
    free: 0,
    paid: 0,
    subscriptionOnly: 0,
    warnings: [`${provider.keyEnvVar} is not configured.`],
    balance: null,
    subscription: null,
  };
}

export async function syncProvider(slug: string): Promise<ProviderSyncSummary> {
  const provider = getProvider(slug);

  if (!provider) throw new Error(`Unknown provider: ${slug}`);

  if (!providerKeyConfigured(provider.keyEnvVar)) {
    saveProviderRuntime(slug, {
      status: "unconfigured",
      balanceUsd: null,
      rpm: null,
      rpmPlan: null,
      subscriptionMode: null,
      subscriptionPlan: null,
      subscriptionTokenLimit: null,
      subscriptionTokensUsed: null,
      subscriptionTokensRemaining: null,
      subscriptionAllowed: null,
      subscriptionExpiresAt: null,
      error: null,
    });

    return unconfiguredSummary(provider);
  }

  const [balanceResult, subscriptionResult] = await Promise.allSettled([
    provider.capabilities.balance
      ? fetchProviderBalance(provider)
      : Promise.resolve(null),
    provider.capabilities.subscription
      ? fetchProviderSubscription(provider)
      : Promise.resolve(null),
  ]);
  const balance =
    balanceResult.status === "fulfilled" ? balanceResult.value : null;
  const subscription =
    subscriptionResult.status === "fulfilled" ? subscriptionResult.value : null;
  const warnings: string[] = [];

  if (balanceResult.status === "rejected") {
    warnings.push(`Balance: ${String(balanceResult.reason)}`);
  }
  if (subscriptionResult.status === "rejected") {
    warnings.push(`Subscription: ${String(subscriptionResult.reason)}`);
  }

  let models: UpstreamModel[];

  try {
    models = await fetchUpstreamModels(provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    saveProviderRuntime(slug, {
      status: "error",
      balanceUsd: balance?.balanceUsd ?? null,
      rpm: balance?.rpm ?? null,
      rpmPlan: balance?.rpmPlan ?? null,
      subscriptionMode: subscription?.mode ?? null,
      subscriptionPlan: subscription?.plan ?? null,
      subscriptionTokenLimit: subscription?.tokenLimit ?? null,
      subscriptionTokensUsed: subscription?.tokensUsed ?? null,
      subscriptionTokensRemaining: subscription?.tokensRemaining ?? null,
      subscriptionAllowed: subscription?.allowed ?? null,
      subscriptionExpiresAt: subscription?.expiresAt ?? null,
      error: message,
    });

    throw error;
  }

  const metadata =
    provider.slug === "savant"
      ? await fetchPublicMetadata().catch(() => new Map<string, ModelSpec>())
      : new Map<string, ModelSpec>();
  const synced = buildSyncedModels(provider, models, metadata);

  replaceModels(synced, getMarkupBps(), slug);

  const free = synced.filter(
    (model) => model.allowFree && model.tokenWeight > 0,
  ).length;
  const paid = synced.filter(
    (model) =>
      !(model.allowFree && model.tokenWeight > 0) && model.costInputMicros > 0,
  ).length;
  const status =
    subscription?.allowed === false || balance?.limitReached
      ? "exhausted"
      : "active";

  saveProviderRuntime(slug, {
    status,
    balanceUsd: balance?.balanceUsd ?? null,
    rpm: balance?.rpm ?? null,
    rpmPlan: balance?.rpmPlan ?? null,
    subscriptionMode: subscription?.mode ?? null,
    subscriptionPlan: subscription?.plan ?? null,
    subscriptionTokenLimit: subscription?.tokenLimit ?? null,
    subscriptionTokensUsed: subscription?.tokensUsed ?? null,
    subscriptionTokensRemaining: subscription?.tokensRemaining ?? null,
    subscriptionAllowed: subscription?.allowed ?? null,
    subscriptionExpiresAt: subscription?.expiresAt ?? null,
    error: warnings.length > 0 ? warnings.join("; ") : null,
    syncedAt: new Date().toISOString(),
  });

  return {
    slug,
    imported: synced.length,
    free,
    paid,
    subscriptionOnly: synced.length - free - paid,
    warnings,
    balance,
    subscription,
  };
}

export async function syncAllEnabled(): Promise<SyncAllSummary> {
  const providers = listProviderRecords().filter(
    (provider) => provider.enabled,
  );
  const results: ProviderSyncSummary[] = [];

  for (const provider of providers) {
    try {
      results.push(await syncProvider(provider.slug));
    } catch (error) {
      results.push({
        slug: provider.slug,
        imported: 0,
        free: 0,
        paid: 0,
        subscriptionOnly: 0,
        warnings: [
          error instanceof Error ? error.message : "Provider sync failed",
        ],
        balance: null,
        subscription: null,
      });
    }
  }

  return {
    imported: results.reduce((total, row) => total + row.imported, 0),
    free: results.reduce((total, row) => total + row.free, 0),
    paid: results.reduce((total, row) => total + row.paid, 0),
    subscriptionOnly: results.reduce(
      (total, row) => total + row.subscriptionOnly,
      0,
    ),
    warnings: results.flatMap((row) =>
      row.warnings.map((warning) => `${row.slug}: ${warning}`),
    ),
    providers: results,
  };
}

export async function testProvider(slug: string) {
  const provider = getProvider(slug);

  if (!provider) throw new Error(`Unknown provider: ${slug}`);

  const models = await fetchUpstreamModels(provider);

  return { slug, models: models.length };
}
