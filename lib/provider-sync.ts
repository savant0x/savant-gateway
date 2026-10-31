import "server-only";

import { providersDue, syncIntervalMs } from "./provider-sync-policy";
import { providerKeyConfigured } from "./providers/registry";
import { syncProvider } from "./providers/sync";
import { listProviderCatalogSummary } from "./store/provider-catalog";
import { clearPublicCatalogCache } from "./store/public-catalog";

export { providersDue, syncIntervalMs };

/** Floor between attempts, so a burst of page views cannot stampede a sync. */
const MIN_ATTEMPT_MS = 5 * 60 * 1000;

let inFlight = false;
let lastAttempt = 0;

/**
 * Stale-while-revalidate for provider catalogs, with no scheduler. The catalog
 * render calls this and ignores the result, so a slow upstream never delays the
 * page and the refresh lands for a later visitor.
 *
 * Known boundary: this is an in-process guard. The supported topology is one
 * Node process on one volume; a second instance would run its own refresh.
 */
export function ensureProvidersFresh(now = Date.now()): void {
  const interval = syncIntervalMs(process.env.PROVIDER_SYNC_INTERVAL_HOURS);

  if (interval === 0 || inFlight || now - lastAttempt < MIN_ATTEMPT_MS) return;

  const due = providersDue(
    listProviderCatalogSummary().map((provider) => ({
      slug: provider.slug,
      enabled: provider.enabled,
      configured: providerKeyConfigured(provider.keyEnvVar),
      syncedAt: provider.syncedAt,
    })),
    now,
    interval,
  );

  if (due.length === 0) return;

  inFlight = true;
  lastAttempt = now;

  void (async () => {
    try {
      for (const slug of due) {
        // A provider failure is recorded on its own row; it must not stop the
        // remaining providers from refreshing.
        await syncProvider(slug).catch(() => undefined);
      }

      clearPublicCatalogCache();
    } finally {
      inFlight = false;
    }
  })();
}
