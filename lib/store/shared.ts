import "server-only";

/**
 * The server boundary for the row projections.
 *
 * The types and mappers now live in `lib/projections.ts`, which has no
 * `server-only` import: the ported storage layer runs under the Node test
 * runner, and `server-only` throws outside a React server context, so a module
 * that imports it cannot be loaded by a test at all.
 *
 * This file keeps the boundary where it was — anything under `lib/store/` is
 * server code — while re-exporting the single implementation rather than
 * holding a copy of it.
 */
export * from "../projections";
