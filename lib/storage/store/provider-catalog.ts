import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ProviderCatalogSummary } from "../../provider-catalog.ts";

import {
  PROVIDER_CATALOG_SUMMARY_SELECT,
  toProviderCatalogSummary,
  type ProviderCatalogSummarySource,
} from "../../provider-catalog.ts";
import { providerKeyConfigured } from "../../providers/registry.ts";

/**
 * Provider catalog summary, ported to the async handle (FID-085 step 4).
 *
 * The statement and the row mapper are imported from `lib/provider-catalog.ts`
 * rather than restated, so the operator console and the ported path cannot
 * disagree about what a provider contributes. Only the read is new.
 *
 * `configured` is filled from the environment variable *name* the registry
 * stores; the value itself is never read here, written, or returned.
 */
export async function listProviderCatalogSummary(
  db: PostgresDatabase,
): Promise<Array<ProviderCatalogSummary & { keyEnvVar: string }>> {
  const rows = await db
    .prepare(PROVIDER_CATALOG_SUMMARY_SELECT)
    .all<ProviderCatalogSummarySource>();

  return rows.map((row) => {
    const summary = toProviderCatalogSummary(row);

    return { ...summary, configured: providerKeyConfigured(summary.keyEnvVar) };
  });
}
