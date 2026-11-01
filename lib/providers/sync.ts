import "server-only";

import type { ProviderRecord, UpstreamModel } from "./types.ts";
import type { ModelSpec } from "./catalog.ts";
import type { ProviderSyncDeps } from "../storage/providers/sync.ts";

import { getDatabase } from "../storage/runtime.ts";
import {
  fetchUpstreamModels as portedFetchUpstreamModels,
  syncAllEnabled as portedSyncAllEnabled,
  syncProvider as portedSyncProvider,
  testProvider as portedTestProvider,
} from "../storage/providers/sync.ts";

import {
  fetchProviderBalance,
  fetchProviderSubscription,
  providerFetch,
} from "./request.ts";

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
 * input is the provider's own catalog.
 */

const DEFAULT_PUBLIC_MODELS_URL = "https://apinex.bond/api/public/models";

async function fetchPublicMetadata(): Promise<Map<string, ModelSpec>> {
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

function deps(): ProviderSyncDeps {
  return {
    request: (provider, path, init) => providerFetch(provider, path, init),
    fetchBalance: fetchProviderBalance,
    fetchSubscription: fetchProviderSubscription,
    fetchMetadata: fetchPublicMetadata,
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
