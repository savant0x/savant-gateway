import "server-only";

import { db } from "../db";
import { reconcileRoutesIn } from "../route-reconcile";

import { clearPublicCatalogCache } from "./public-catalog";
import { getMarkupBps } from "./settings";

export { routesByGroup } from "../route-reconcile";

/** Reconciles the live catalog and invalidates the published projection. */
export function reconcileRoutes() {
  const reconciled = reconcileRoutesIn(db, getMarkupBps());

  clearPublicCatalogCache();

  return reconciled;
}
