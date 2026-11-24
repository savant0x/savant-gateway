import type { ProviderRecord, UpstreamModel } from "./types.ts";
import type { ProviderRequest } from "../storage/providers/sync.ts";

import { fetchUpstreamModels } from "../storage/providers/sync.ts";

import { buildSyncedCatalog } from "./catalog.ts";
import { providerKeyConfigured } from "./registry.ts";

/**
 * A read-only view of what a provider would add, usable before the operator buys
 * a key.
 *
 * The import path is deliberately not opened here: an unconfigured provider must
 * never put rows into the catalog, because every call to them would answer 503.
 * What the operator needs *before* paying is the answer to "which models, at what
 * price, and what would be refused" — and for a provider whose catalog is public
 * (InferHub answers `GET /v1/models` with 200 and 507 rows on 2026-11-22) that
 * question does not need a credential at all.
 *
 * This module takes no database handle, so "preview writes nothing" is a property
 * of the signature rather than a promise in a comment. Counting reuses
 * `buildSyncedCatalog`, the same builder the sync uses, so the preview cannot
 * drift from what an import would actually do.
 */

export const PREVIEW_SAMPLE_SIZE = 12;

export type PreviewRow = {
  id: string;
  name: string;
  family: string;
  allowFree: boolean;
  /** Micro-dollars per 1M tokens; `0` for a free-pool row. */
  costInputMicros: number;
  costOutputMicros: number;
};

export type ProviderCatalogPreview = {
  slug: string;
  /** Whether this runtime read the catalog with no credential. */
  keyless: boolean;
  upstreamRows: number;
  imported: number;
  free: number;
  paid: number;
  subscriptionOnly: number;
  /** The same refusals a sync reports, counted. */
  refused: { alias: number; media: number; freePool: number };
  /** The largest families this provider would add, when nothing else explains it. */
  sample: PreviewRow[];
};

export type PreviewDeps = {
  /** Transport, injected so the tests exercise the real validation. */
  request: ProviderRequest;
  /**
   * The provider that owns the unprefixed public id namespace, so the sample
   * shows the ids an import would actually publish. Supplied by the caller,
   * which holds the database handle: this module still takes none.
   */
  defaultSlug?: string | null;
  /** Overrides the shipped paginated reader; the tests use it to stay offline. */
  readCatalog?: (
    provider: ProviderRecord,
    request: ProviderRequest,
  ) => Promise<UpstreamModel[]>;
};

export async function previewProviderCatalog(
  provider: ProviderRecord,
  deps: PreviewDeps,
): Promise<ProviderCatalogPreview> {
  const read = deps.readCatalog ?? defaultRead;
  const models = await read(provider, deps.request);

  const { rows, skippedAliases, skippedMedia, skippedFreePool } =
    buildSyncedCatalog(provider, models, new Map(), deps.defaultSlug ?? null);

  const free = rows.filter(
    (model) => model.allowFree && model.tokenWeight > 0,
  ).length;
  const paid = rows.filter(
    (model) =>
      !(model.allowFree && model.tokenWeight > 0) && model.costInputMicros > 0,
  ).length;

  return {
    slug: provider.slug,
    keyless: !providerKeyConfigured(provider.keyEnvVar),
    upstreamRows: models.length,
    imported: rows.length,
    free,
    paid,
    subscriptionOnly: rows.length - free - paid,
    refused: {
      alias: skippedAliases.length,
      media: skippedMedia.length,
      freePool: skippedFreePool.length,
    },
    sample: rows.slice(0, PREVIEW_SAMPLE_SIZE).map((model) => ({
      id: model.id,
      name: model.name,
      family: model.family,
      allowFree: model.allowFree,
      costInputMicros: model.costInputMicros,
      costOutputMicros: model.costOutputMicros,
    })),
  };
}

/** The shipped paginated reader: validation and the page cap come with it. */
function defaultRead(provider: ProviderRecord, request: ProviderRequest) {
  return fetchUpstreamModels(provider, { request });
}
