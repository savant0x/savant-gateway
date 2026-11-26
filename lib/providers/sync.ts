import "server-only";

import type { ProviderRecord, UpstreamModel } from "./types.ts";
import type { ModelSpec } from "./catalog.ts";
import type { ProviderSyncDeps } from "../storage/providers/sync.ts";

import { getDatabase } from "../storage/runtime.ts";
import { getDefaultProviderSlug } from "../storage/store/providers.ts";
import {
  fetchUpstreamModels as portedFetchUpstreamModels,
  syncAllEnabled as portedSyncAllEnabled,
  syncProvider as portedSyncProvider,
  testProvider as portedTestProvider,
} from "../storage/providers/sync.ts";

import {
  fetchProviderBalance,
  fetchProviderSubscription,
  fetchProviderUrl,
  providerFetch,
} from "./request.ts";
import { readCatalogGroups } from "./catalog-groups.ts";

/**
 * Provider catalog sync, wired to the real database and the real transport
 * (FID-086, step 4 cutover).
 *
 * The read-before-write rules live in the ported module and are not repeated
 * here: pagination is followed within a page cap, a malformed body throws before
 * anything is written, and `replaceModels` preserves manual prices, manual costs,
 * manual group assignments and operator disables.
 *
 * The public metadata overlay stays here because it is specific to the default
 * provider and is a best-effort read: a failure must not stop a sync whose real
 * input is the provider's own catalog. Which provider owns the overlay is
 * decided here, where the URL is known, so the sync port carries no
 * provider-name branch and a second provider's rows can never be priced or
 * labelled by the default provider's map.
 */

/**
 * The public metadata overlay is opt-in: it was Apinex's price sheet, and with
 * that upstream retired there is no default URL to point at
 * (FID-2026-1126-001). Only an explicit `PROVIDER_PUBLIC_MODELS_URL` is read, so
 * the elected default's rows can never inherit a retired vendor's figures by id
 * collision.
 */
async function fetchPublicMetadata(): Promise<Map<string, ModelSpec>> {
  const url = process.env.PROVIDER_PUBLIC_MODELS_URL?.trim();

  if (!url) return new Map<string, ModelSpec>();

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

function deps(): ProviderSyncDeps {
  return {
    request: (provider, path, init) => providerFetch(provider, path, init),
    fetchBalance: fetchProviderBalance,
    fetchSubscription: fetchProviderSubscription,
    // The group document is absolute and provider-scoped, like the wallet: it is
    // read only when the row names a URL, and a shape change throws so the sync
    // reports it instead of storing an empty snapshot.
    fetchCatalogGroups: async (provider) => {
      if (!provider.catalogUrl) return [];

      const response = await fetchProviderUrl(provider, provider.catalogUrl);

      if (!response.ok) {
        throw new Error(`catalog groups answered ${response.status}`);
      }

      return readCatalogGroups(await response.json());
    },
    // The overlay describes one catalog: the default provider's. Which row that
    // is comes from the database, so moving the default moves the overlay with
    // it and no other provider can inherit this map.
    fetchMetadata: async (provider) =>
      provider.slug === (await getDefaultProviderSlug(await getDatabase()))
        ? fetchPublicMetadata()
        : new Map<string, ModelSpec>(),
  };
}

export async function fetchUpstreamModels(
  provider: ProviderRecord,
): Promise<UpstreamModel[]> {
  return portedFetchUpstreamModels(provider, deps());
}

export async function syncProvider(slug: string) {
  return portedSyncProvider(await getDatabase(), slug, deps());
}

export async function syncAllEnabled() {
  return portedSyncAllEnabled(await getDatabase(), deps());
}

export async function testProvider(slug: string) {
  return portedTestProvider(await getDatabase(), slug, deps());
}
