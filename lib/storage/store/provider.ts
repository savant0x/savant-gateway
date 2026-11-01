import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ProviderStatus } from "../../types.ts";

import { DEFAULT_PROVIDER_SLUG } from "../../providers/registry.ts";

import { getProviderStatusBySlug } from "./providers.ts";

/**
 * Backward-compatible single-provider view: the default provider's registry
 * status. The legacy `provider_status` row is migrated at boot and no longer
 * read, so a registry sync is reflected everywhere immediately.
 */
export async function getProviderStatus(
  db: PostgresDatabase,
): Promise<ProviderStatus> {
  return getProviderStatusBySlug(db, DEFAULT_PROVIDER_SLUG);
}
