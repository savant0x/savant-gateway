import "server-only";

import type {
  ProviderRecord,
  ProviderSyncSummary,
  SyncAllSummary,
  UpstreamModel,
} from "./types";

import { redactSecrets } from "../redaction";
import { replaceModels } from "../store/models";
import {
  getProvider,
  listProviderRecords,
  saveProviderCatalogSync,
} from "../store/providers";
import { getMarkupBps } from "../store/settings";

import { buildSyncedModels, type ModelSpec } from "./catalog";
import { readUpstreamModelPage } from "./model-list";
import { providerKeyConfigured } from "./registry";
import { providerFetch, readProviderError } from "./request";
import { refreshProviderRuntime } from "./runtime";

const DEFAULT_PUBLIC_MODELS_URL = "https://apinex.bond/api/public/models";
// A provider that paginates its catalog must be read completely; a cap keeps a
// broken cursor from spending the request budget forever.
const MAX_CATALOG_PAGES = 10;

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

async function readPageBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(
      "Upstream catalog response was not valid JSON; refusing to replace the catalog.",
    );
  }
}

/**
 * Reads the provider's whole catalog. Envelope validation and pagination are
 * part of the read: a malformed body or an abandoned cursor throws before any
 * write, so a bad response can never delist a working catalog.
 */
export async function fetchUpstreamModels(
  provider: ProviderRecord,
): Promise<UpstreamModel[]> {
  const collected: UpstreamModel[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_CATALOG_PAGES; page += 1) {
    const path = cursor
      ? `/models?after_id=${encodeURIComponent(cursor)}`
      : "/models";
    const response = await providerFetch(provider, path);

    if (!response.ok) throw new Error(await readProviderError(response));

    const parsed = readUpstreamModelPage(await readPageBody(response));

    collected.push(...parsed.models);

    if (!parsed.hasMore) return collected;

    if (!parsed.lastId) {
      throw new Error(
        "Upstream catalog reported another page without a cursor; refusing a partial import.",
      );
    }

    cursor = parsed.lastId;
  }

  throw new Error(
    `Upstream catalog exceeded ${MAX_CATALOG_PAGES} pages; refusing a partial import.`,
  );
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
    return unconfiguredSummary(provider);
  }

  const { balance, subscription, warnings } =
    await refreshProviderRuntime(slug);
  const models = await fetchUpstreamModels(provider);

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

  saveProviderCatalogSync(slug);

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
          redactSecrets(
            error instanceof Error ? error.message : "Provider sync failed",
          ),
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
