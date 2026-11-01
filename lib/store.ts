import "server-only";

import { bindStoreRuntime } from "./store-facade/runtime.ts";
import { getDatabase } from "./storage/runtime.ts";

/**
 * The server store surface (FID-2026-1031-086, step 4).
 *
 * Every export is asynchronous now. The synchronous SQLite implementations that
 * used to live under `lib/store/` were deleted with the cutover; this module is
 * the one place that binds the request path to the PostgreSQL handle and
 * re-exports the ported modules under the names callers already use.
 *
 * The binding happens here because the application imports this barrel, while
 * the tests bind their own handle through `bindStoreRuntime`.
 */
bindStoreRuntime(getDatabase);

export type {
  AuthenticatedKey,
  FreePoolReservation,
  GatewayModel,
  ProviderStatusInput,
} from "./projections.ts";

export { DEFAULT_TENANT } from "./storage/store/billing.ts";

export * from "./store-facade/access.ts";
export * from "./store-facade/catalog.ts";
export * from "./store-facade/insights.ts";
export * from "./store-facade/money.ts";
export * from "./store-facade/operations.ts";
