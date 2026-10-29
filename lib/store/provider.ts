import "server-only";

import type { ProviderStatus } from "../types";

import { DEFAULT_PROVIDER_SLUG } from "../providers/registry";

import { getProviderStatusBySlug } from "./providers";

/**
 * Backward-compatible single-provider view: the default provider's registry
 * status. The legacy `provider_status` row is migrated at boot and no longer
 * read, so a registry sync is reflected everywhere immediately.
 */
export function getProviderStatus(): ProviderStatus {
  return getProviderStatusBySlug(DEFAULT_PROVIDER_SLUG);
}
