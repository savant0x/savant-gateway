import type { PostgresDatabase } from "../storage/pg-adapter.ts";

import { storeRuntime } from "./runtime.ts";

/**
 * Turns a ported store function into a façade function with the same arguments.
 *
 * Every ported module takes the handle first (`getProvider(db, slug)`) so it can
 * be tested against its own database. Callers should not have to thread a handle
 * through forty-three files, so this removes that argument and supplies the one
 * bound handle instead: `getProvider(slug)`.
 *
 * The return type is `Promise<Awaited<R>>` rather than `Promise<R>` because the
 * ported functions are already async; wrapping without flattening would make a
 * caller await twice for a value the first await already has.
 */
export function bound<A extends unknown[], R>(
  fn: (db: PostgresDatabase, ...args: A) => R,
): (...args: A) => Promise<Awaited<R>> {
  return (async (...args: A) => fn(await storeRuntime(), ...args)) as (
    ...args: A
  ) => Promise<Awaited<R>>;
}
