import "server-only";

import {
  ensureProviderObservation as portedEnsureObservation,
  refreshEnabledProviderAccounts as portedRefreshEnabled,
  refreshProviderRuntime as portedRefresh,
  type ProviderRuntimeDeps,
} from "../storage/providers/runtime.ts";
import { getDatabase } from "../storage/runtime.ts";

import { fetchProviderBalance, fetchProviderSubscription } from "./request.ts";

/**
 * Provider account checks, wired to the real database and the real transport
 * (FID-086, step 4 cutover).
 *
 * The ported module takes its database and its network functions as arguments so
 * it stays testable. This is the one place those arguments become real: the
 * handle comes from the storage singleton, and the fetchers are the credential-
 * carrying ones from `./request.ts`. Callers keep the names they already used.
 *
 * A check with no working credential still returns warnings rather than throwing;
 * the ported module decides that, and duplicating the decision here would let the
 * two disagree about whether a provider is refusing or simply unconfigured.
 */

function deps(): ProviderRuntimeDeps {
  return {
    fetchBalance: fetchProviderBalance,
    fetchSubscription: fetchProviderSubscription,
  };
}

export async function refreshProviderRuntime(slug: string) {
  return portedRefresh(await getDatabase(), slug, deps());
}

export async function ensureProviderObservation(slug: string) {
  return portedEnsureObservation(await getDatabase(), slug, deps());
}

export async function refreshEnabledProviderAccounts() {
  return portedRefreshEnabled(await getDatabase(), deps());
}
