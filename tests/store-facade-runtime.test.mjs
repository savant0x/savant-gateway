import assert from "node:assert/strict";
import test from "node:test";

import { bound } from "../lib/store-facade/bound.ts";
import {
  bindStoreRuntime,
  storeRuntime,
} from "../lib/store-facade/runtime.ts";

/**
 * The façade binding (FID-086, step 4).
 *
 * The sweep replaces forty-three files' imports at once, so the mechanism those
 * files depend on is tested before any of them move: the handle is supplied by
 * the binding rather than the caller, an explicit binding wins, and arguments
 * and promises pass through unchanged.
 *
 * The unbound case is asserted as "never undefined" rather than a specific
 * message. The façade self-binds by importing the server runtime, which is
 * unavailable to this runner; under a route that import succeeds. Asserting the
 * test runner's failure text would pin the test to an environment instead of
 * pinning the contract, which is that a caller always gets a handle or an error.
 */

test("an unbound façade never returns undefined", async () => {
  const outcome = await storeRuntime().then(
    (value) => ({ value }),
    (error) => ({ error }),
  );

  assert.ok("value" in outcome || "error" in outcome);

  if ("value" in outcome) assert.ok(outcome.value, "resolved to a handle");
  else assert.ok(outcome.error instanceof Error, "rejected with an error");
});

test("an explicit binding is used", async () => {
  const handle = { prepare: () => null };

  bindStoreRuntime(async () => handle);

  assert.equal(await storeRuntime(), handle);
});

test("a bound function receives the handle and keeps its arguments", async () => {
  const handle = { prepare: () => null };

  bindStoreRuntime(async () => handle);

  const add = bound(async (db, left, right) => {
    assert.equal(db, handle, "the bound handle is supplied, not passed by the caller");

    return left + right;
  });

  assert.equal(await add(2, 3), 5);
  assert.equal(await add(-1, 1), 0);
});

test("a ported function's promise is flattened once", async () => {
  const read = bound(async (_db, value) => Promise.resolve({ value }));

  assert.deepEqual(await read("x"), { value: "x" });
});
