import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ProviderStatus } from "../../types.ts";

import { DEFAULT_PROVIDER_SLUG } from "../../providers/registry.ts";

import {
  getDefaultProviderSlug,
  getProviderStatusBySlug,
} from "./providers.ts";

/**
 * Backward-compatible single-provider view: the default provider's registry
 * status. The legacy `provider_status` row is migrated at boot and no longer
 * read, so a registry sync is reflected everywhere immediately.
 *
 * "Default" is the stored `providers.is_default` row, not a constant; the
 * constant remains only as the slug an empty registry is described by, so this
 * view never has to answer null.
 */
export async function getProviderStatus(
  db: PostgresDatabase,
): Promise<ProviderStatus> {
  const slug = (await getDefaultProviderSlug(db)) ?? DEFAULT_PROVIDER_SLUG;

  return getProviderStatusBySlug(db, slug);
}
