import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  ProviderRecord,
  ProviderSyncSummary,
  SyncAllSummary,
  UpstreamModel,
} from "../../providers/types.ts";
import type { ModelSpec } from "../../providers/catalog.ts";
import type { ProviderCatalogGroup } from "../../providers/catalog-groups.ts";

import { redactSecrets } from "../../redaction.ts";
import { buildSyncedCatalog } from "../../providers/catalog.ts";
import { readProviderError } from "../../providers/error-text.ts";
import { readUpstreamModelPage } from "../../providers/model-list.ts";
import { providerKeyConfigured } from "../../providers/registry.ts";
import { replaceModels } from "../store/model-sync.ts";
import { replaceProviderCatalogGroups } from "../store/provider-catalog-groups.ts";
import {
  getProvider,
  listProviderRecords,
  saveProviderCatalogSync,
} from "../store/providers.ts";
import { getMarkupBps } from "../store/settings.ts";
import { startRematch } from "../../content/store/rematch.ts";

import { refreshProviderRuntime, type ProviderRuntimeDeps } from "./runtime.ts";

/**
 * Provider catalog sync, ported to the async handle (FID-086, Batch B).
 *
 * The read-before-write rules are the reason a sync is safe on a schedule, and
 * they are unchanged: pagination is followed to completion within a page cap, a
 * malformed body throws before any write, and `replaceModels` preserves manual
 * prices, manual costs, manual group assignments and operator disables.
 *
 * Two shapes differ from the synchronous version:
 *
 * 1. **The transport is injected.** `lib/providers/request.ts` imports
 *    `server-only`, carries credentials and opens sockets. This module receives a
 *    `request(provider, path, init)` function, so the validation and pagination
 *    below are still the real ones while the tests provide a Response directly.
 * 2. **Pagination validation is kept in the port.** `readUpstreamModelPage` and
 *    the page cap are not delegated to the injected function: an envelope that
 *    is an error object, a truncated body or a cursor that never advances must
 *    fail here, before anything can replace a working catalog.
 */

const MAX_CATALOG_PAGES = 10;

export type ProviderRequest = (
  provider: ProviderRecord,
  path: string,
  init?: RequestInit,
) => Promise<Response>;

export type ProviderSyncDeps = ProviderRuntimeDeps & {
  request?: ProviderRequest;
  /**
   * Extra fields a provider publishes outside its `/models` envelope. The
   * provider is passed in because the URL belongs to one catalog, not to the
   * sync loop; returning an empty map means "this provider has no overlay".
   */
  fetchMetadata?: (provider: ProviderRecord) => Promise<Map<string, ModelSpec>>;
  /**
   * The vendor's prefix-group document, when it publishes one. Optional: a
   * provider without such a document keeps whatever snapshot it already has.
   */
  fetchCatalogGroups?: (
    provider: ProviderRecord,
  ) => Promise<ProviderCatalogGroup[]>;
};

function transport(deps: ProviderSyncDeps) {
  if (!deps.request) {
    throw new Error("No provider request transport is configured.");
  }

  return deps.request;
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
  deps: ProviderSyncDeps,
): Promise<UpstreamModel[]> {
  const request = transport(deps);
  const collected: UpstreamModel[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_CATALOG_PAGES; page += 1) {
    const path = cursor
      ? `/models?after_id=${encodeURIComponent(cursor)}`
      : "/models";
    const response = await request(provider, path);

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

/** Reports dropped upstream rows instead of letting them vanish silently. */
function droppedRowsWarning(kind: string, ids: string[]) {
  if (ids.length === 0) return [];

  const sample = ids.slice(0, 5).join(", ");

  return [
    `${ids.length} upstream ${kind} row(s) not imported (${sample}${ids.length > 5 ? ", …" : ""}).`,
  ];
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

export async function syncProvider(
  db: PostgresDatabase,
  slug: string,
  deps: ProviderSyncDeps = {},
): Promise<ProviderSyncSummary> {
  const provider = await getProvider(db, slug);

  if (!provider) throw new Error(`Unknown provider: ${slug}`);

  if (!providerKeyConfigured(provider.keyEnvVar)) {
    return unconfiguredSummary(provider);
  }

  const { balance, subscription, warnings } = await refreshProviderRuntime(
    db,
    slug,
    deps,
  );
  const models = await fetchUpstreamModels(provider, deps);
  const metadata = deps.fetchMetadata
    ? await deps
        .fetchMetadata(provider)
        .catch(() => new Map<string, ModelSpec>())
    : new Map<string, ModelSpec>();
  const {
    rows: synced,
    skippedAliases,
    skippedMedia,
    skippedFreePool,
  } = buildSyncedCatalog(provider, models, metadata);

  await replaceModels(db, synced, await getMarkupBps(db), slug);

  const free = synced.filter(
    (model) => model.allowFree && model.tokenWeight > 0,
  ).length;
  const paid = synced.filter(
    (model) =>
      !(model.allowFree && model.tokenWeight > 0) && model.costInputMicros > 0,
  ).length;

  await saveProviderCatalogSync(db, slug);

  // The group document is vendor metadata: pools and prompt notes, never a
  // routing or pricing input. A failed read keeps the previous snapshot and
  // says so, because the catalog itself did sync.
  const groupWarnings: string[] = [];

  if (provider.catalogUrl && deps.fetchCatalogGroups) {
    try {
      await replaceProviderCatalogGroups(
        db,
        slug,
        await deps.fetchCatalogGroups(provider),
      );
    } catch (error) {
      groupWarnings.push(
        `catalog groups unavailable: ${redactSecrets(
          error instanceof Error ? error.message : "read failed",
        )}`,
      );
    }
  }

  // A catalog change is an invalidation signal for stored content matching.
  // Queueing is bounded and never fetches a publisher. Content storage is
  // optional for a catalog sync, so a content-schema failure must not fail it.
  try {
    await startRematch(db, "catalog");
  } catch {
    // The operator can run the rematch explicitly once content storage is up.
  }

  return {
    slug,
    imported: synced.length,
    free,
    paid,
    subscriptionOnly: synced.length - free - paid,
    warnings: [
      ...warnings,
      ...droppedRowsWarning("alias", skippedAliases),
      ...droppedRowsWarning("non-text output", skippedMedia),
      ...droppedRowsWarning(
        "free-pool (resale not permitted)",
        skippedFreePool,
      ),
      ...groupWarnings,
    ],
    balance,
    subscription,
  };
}

export async function syncAllEnabled(
  db: PostgresDatabase,
  deps: ProviderSyncDeps = {},
): Promise<SyncAllSummary> {
  const providers = (await listProviderRecords(db)).filter(
    (provider) => provider.enabled,
  );
  const results: ProviderSyncSummary[] = [];

  for (const provider of providers) {
    try {
      results.push(await syncProvider(db, provider.slug, deps));
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

export async function testProvider(
  db: PostgresDatabase,
  slug: string,
  deps: ProviderSyncDeps = {},
) {
  const provider = await getProvider(db, slug);

  if (!provider) throw new Error(`Unknown provider: ${slug}`);

  const models = await fetchUpstreamModels(provider, deps);

  return { slug, models: models.length };
}
