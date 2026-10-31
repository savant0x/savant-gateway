import "server-only";

import type { ProviderCatalogSummary } from "../provider-catalog";

import { db } from "../db";
import { providerCatalogSummaryIn } from "../provider-catalog";
import { providerKeyConfigured } from "../providers/registry";

export function listProviderCatalogSummary(): Array<
  ProviderCatalogSummary & { keyEnvVar: string }
> {
  return providerCatalogSummaryIn(db).map(({ keyEnvVar, ...row }) => ({
    ...row,
    configured: providerKeyConfigured(keyEnvVar),
    keyEnvVar,
  }));
}
