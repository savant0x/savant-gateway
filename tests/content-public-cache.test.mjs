import assert from "node:assert/strict";
import test from "node:test";

import {
  cachedPublicRead,
  PUBLIC_READ_MAX_KEYS,
  resetPublicReadCache,
} from "../lib/content/public-cache.ts";

test("public reads share one load and reuse the memoized value", async () => {
  resetPublicReadCache();

  let loads = 0;
  const load = async () => {
    loads += 1;

    return { total: 3 };
  };

  const [first, second] = await Promise.all([
    cachedPublicRead("signal:test", load),
    cachedPublicRead("signal:test", load),
  ]);

  assert.deepEqual(first, { total: 3 });
  assert.deepEqual(second, { total: 3 });
  assert.equal(loads, 1);

  await cachedPublicRead("signal:test", load);
  assert.equal(loads, 1);

  resetPublicReadCache();
});

test("a failed load is not memoized", async () => {
  resetPublicReadCache();

  let attempts = 0;

  await assert.rejects(() =>
    cachedPublicRead("signal:test:fail", async () => {
      attempts += 1;
      throw new Error("storage unavailable");
    }),
  );

  const value = await cachedPublicRead("signal:test:fail", async () => {
    attempts += 1;

    return "recovered";
  });

  assert.equal(value, "recovered");
  assert.equal(attempts, 2);

  resetPublicReadCache();
});

test("the key map is bounded", async () => {
  resetPublicReadCache();

  for (let index = 0; index < PUBLIC_READ_MAX_KEYS + 25; index += 1) {
    await cachedPublicRead(`signal:key:${index}`, async () => index);
  }

  // The oldest keys were evicted; the newest still answer.
  assert.equal(
    await cachedPublicRead(`signal:key:${PUBLIC_READ_MAX_KEYS + 24}`, async () => -1),
    PUBLIC_READ_MAX_KEYS + 24,
  );

  resetPublicReadCache();
});
