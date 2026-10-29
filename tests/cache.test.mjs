import assert from "node:assert/strict";
import test from "node:test";

import { createTtlCache } from "../lib/cache.ts";

test("a cached value is served until its ttl expires", () => {
  let clock = 1_000;
  const cache = createTtlCache(5_000, () => clock);

  assert.equal(cache.get(), null);
  cache.set({ models: 45 });
  assert.deepEqual(cache.get(), { models: 45 });

  clock += 4_999;
  assert.deepEqual(cache.get(), { models: 45 });

  clock += 1;
  assert.equal(cache.get(), null);
});

test("clear drops the value immediately", () => {
  const cache = createTtlCache(60_000);
  cache.set("catalog");

  assert.equal(cache.get(), "catalog");
  cache.clear();
  assert.equal(cache.get(), null);
});

test("a zero ttl never serves a stale read", () => {
  let clock = 5;
  const cache = createTtlCache(0, () => clock);

  cache.set("value");
  assert.equal(cache.get(), null);
  clock += 1;
  assert.equal(cache.get(), null);
});
