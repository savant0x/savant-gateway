import type { PostgresDatabase } from "../pg-adapter.ts";

import { randomUUID } from "node:crypto";

import { providersDue, syncIntervalMs } from "../../provider-sync-policy.ts";
import { clearPublicCatalogCache } from "../store/catalog.ts";
import { listProviderCatalogSummary } from "../store/provider-catalog.ts";

import { claimProviderSync, releaseProviderSync } from "./lease.ts";

/**
 * Stale-while-revalidate for provider catalogs, ported to the async handle
 * (FID-086, Batch B).
 *
 * The contract is unchanged: a catalog render asks for a refresh and does not
 * wait for it, so a slow upstream never delays a page, and the work lands for a
 * later visitor. Three guards keep that from becoming a stampede:
 *
 * 1. Only providers that are enabled, credentialed and actually stale are
 *    selected — a provider that cannot sync must not be retried on every view.
 * 2. One refresh per handle runs at a time; a second caller joins it instead of
 *    starting a competing sync of the same catalog.
 * 3. A five-minute floor separates render-path attempts, so a burst of page
 *    views cannot outrun a catalog that keeps failing. An explicit scheduler
 *    tick may bypass only this floor with `force`; it cannot bypass the due
 *    interval or the durable lease.
 *
 * Two deliberate differences from the synchronous version:
 *
 * - **State is per handle, not per module.** `lib/storage/store/catalog.ts` keys
 *   its TTL cache by handle for the same reason: a single module-level throttle
 *   would let one database's refresh suppress another's, which in a test suite
 *   means a test passing because a previous test just refreshed.
 * - **The work is awaitable.** The production entry point still returns
 *   immediately, but `refreshProvidersIfDue` returns the slugs it attempted, so
 *   the behaviour is testable without sleeping on a detached promise.
 *
 * The sync function is injected rather than imported: the real one
 * (`lib/providers/sync.ts`) reaches `server-only` and the network, and this
 * module has to load under the test runner.
 */

const MIN_ATTEMPT_MS = 5 * 60 * 1000;

type FreshnessState = {
  inFlight: Promise<string[]> | null;
  lastAttempt: number;
};

const states = new WeakMap<object, FreshnessState>();

function stateFor(db: PostgresDatabase): FreshnessState {
  let state = states.get(db);

  if (!state) {
    state = { inFlight: null, lastAttempt: 0 };
    states.set(db, state);
  }

  return state;
}

export type ProviderSyncDeps = {
  /** Refreshes one provider's catalog. Omitted means no network is available. */
  sync?: (slug: string) => Promise<unknown>;
  now?: number;
  /** Overrides `PROVIDER_SYNC_INTERVAL_HOURS`; `0` disables the refresh. */
  intervalMs?: number;
  /** How long a sync claim is held before another instance may reclaim it. */
  leaseMs?: number;
  /**
   * An explicit scheduler tick may run even when the render path attempted
   * recently. The due interval and durable lease still apply.
   */
  force?: boolean;
};

/**
 * Refreshes every provider whose catalog is due and returns the slugs it
 * attempted. A provider failure is swallowed on purpose: the provider's own row
 * records it, and one failing provider must not stop the rest from refreshing.
 */
export async function refreshProvidersIfDue(
  db: PostgresDatabase,
  deps: ProviderSyncDeps = {},
): Promise<string[]> {
  const state = stateFor(db);
  const now = deps.now ?? Date.now();
  const interval =
    deps.intervalMs ?? syncIntervalMs(process.env.PROVIDER_SYNC_INTERVAL_HOURS);

  if (interval === 0) return [];

  if (state.inFlight) return state.inFlight;

  if (!deps.force && now - state.lastAttempt < MIN_ATTEMPT_MS) return [];

  const summaries = await listProviderCatalogSummary(db);
  const due = providersDue(
    summaries.map((provider) => ({
      slug: provider.slug,
      enabled: provider.enabled,
      configured: provider.configured,
      syncedAt: provider.syncedAt,
    })),
    now,
    interval,
  );

  if (due.length === 0) return [];
  if (!deps.sync) return [];

  state.lastAttempt = now;

  const owner = randomUUID();
  const leaseMs = deps.leaseMs ?? 10 * 60 * 1000;

  const task = (async () => {
    const attempted: string[] = [];

    try {
      for (const slug of due) {
        const at = new Date(now).toISOString();
        const acquired = await claimProviderSync(db, {
          slug,
          owner,
          at,
          expiresAt: new Date(now + leaseMs).toISOString(),
        });

        // Another process owns this provider. It is not a failure; the next
        // tick sees whether the lease was released or expired.
        if (!acquired) continue;

        attempted.push(slug);

        try {
          await deps.sync?.(slug).catch(() => undefined);
        } finally {
          await releaseProviderSync(db, slug, owner);
        }
      }

      // A refresh that landed must be visible on the next render, not after the
      // display cache expires.
      if (attempted.length > 0) clearPublicCatalogCache(db);

      return attempted;
    } finally {
      state.inFlight = null;
    }
  })();

  state.inFlight = task;

  return task;
}

/**
 * The render-path entry point: starts a refresh if one is due and returns
 * immediately. Without a `sync` function nothing is attempted, which is what a
 * test or a read-only script gets.
 */
export function ensureProvidersFresh(
  db: PostgresDatabase,
  deps: ProviderSyncDeps = {},
): void {
  if (!deps.sync) return;

  void refreshProvidersIfDue(db, deps).catch(() => undefined);
}
