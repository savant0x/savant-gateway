import type { PostgresDatabase } from "./pg-adapter.ts";

import { reconcileRoutes } from "./store/routes.ts";
import { getSetting, saveSetting } from "./store/settings.ts";

/**
 * One-time re-election of the published catalog (FID-2026-1102-118).
 *
 * FID-116 scoped route groups to the billing tier, so a free allocation and its
 * metered counterpart finally elect separately. The rule is applied by
 * `reconcileRoutes`, and a sync is the only thing that calls it — which means a
 * catalog imported under the old rule keeps the old flags until someone syncs
 * again. Every such row stayed `is_primary = 0` and was withheld from
 * `/models`, so the paid counterpart of a free model looked stripped when it
 * was imported, priced and active.
 *
 * A stable version key makes the repair a one-time event: the first boot after
 * the upgrade reconciles every row, writes the version, and later boots read it
 * and stop. Reconciliation is idempotent, so an interrupted attempt (reconcile
 * succeeded, version write failed) simply runs again next boot.
 *
 * This runs at boot rather than on read because the flags it repairs decide
 * both the public catalog and the served route, and a wrong answer is visible
 * to customers. A failure throws, exactly like the migration before it, so the
 * process fails closed instead of serving a catalog it knows is mis-elected.
 */

export const ROUTE_ELECTION_VERSION_KEY = "catalog.route_election_version";

/**
 * 2 = route groups scoped to the billing tier (FID-116). Increment this when a
 * later change alters which row a group elects, and the repair runs again.
 */
export const ROUTE_ELECTION_VERSION = "2";

export type RouteElectionBackfill = {
  /** False when this database was already repaired at this version. */
  changed: boolean;
  /** Rows examined by the reconciliation; 0 when no repair was needed. */
  reconciled: number;
};

export async function backfillRouteElection(
  db: PostgresDatabase,
): Promise<RouteElectionBackfill> {
  const current = await getSetting(db, ROUTE_ELECTION_VERSION_KEY);

  if (current === ROUTE_ELECTION_VERSION) {
    return { changed: false, reconciled: 0 };
  }

  const reconciled = await reconcileRoutes(db);

  await saveSetting(db, ROUTE_ELECTION_VERSION_KEY, ROUTE_ELECTION_VERSION);

  return { changed: true, reconciled };
}
