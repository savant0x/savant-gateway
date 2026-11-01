import assert from "node:assert/strict";
import test from "node:test";

import {
  bootstrapMeanCi,
  distribution,
  jsd,
  mean,
  mulberry32,
  quantile,
  totalCount,
} from "../lib/identity/stats/jsd.ts";
import { wilsonInterval } from "../lib/identity/stats/intervals.ts";
import { splitHalfQ95 } from "../lib/identity/stats/split-half.ts";

function close(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

test("distribution normalizes counts and applies additive smoothing", () => {
  assert.deepEqual(distribution({ a: 1, b: 1 }), { a: 0.5, b: 0.5 });
  assert.deepEqual(distribution({ a: 1 }, 1), { a: 1 });
  assert.deepEqual(distribution({ a: 0 }), {});
  assert.deepEqual(distribution({}), {});
});

test("totalCount sums every bucket", () => {
  assert.equal(totalCount({ a: 3, b: 4 }), 7);
  assert.equal(totalCount({}), 0);
});

test("JSD is zero for identical distributions and one bit for disjoint ones", () => {
  close(jsd({ a: 10, b: 5 }, { a: 10, b: 5 }), 0);
  close(jsd({ a: 10 }, { b: 10 }), 1);
  close(jsd({ a: 8, b: 2 }, { a: 8, b: 2 }), 0);
  assert.equal(jsd({}, {}), 0);
});

test("JSD is symmetric, bounded, and smoothing changes an uneven comparison", () => {
  const left = { a: 9, b: 1 };
  const right = { a: 6, b: 4 };

  close(jsd(left, right), jsd(right, left));
  assert.ok(jsd(left, right) > 0 && jsd(left, right) < 1);
  assert.notEqual(jsd(left, right, 1), jsd(left, right));
});

test("mean and quantile handle empty and interpolated inputs", () => {
  assert.equal(mean([]), null);
  assert.equal(mean([1, 2, 3]), 2);
  assert.equal(quantile([], 0.5), null);
  assert.equal(quantile([1, 2, 3], 0.5), 2);
  assert.equal(quantile([0, 10], 0.25), 2.5);
  assert.equal(quantile([0, 10], -1), 0);
  assert.equal(quantile([0, 10], 2), 10);
});

test("mulberry32 is deterministic for a seed and differs across seeds", () => {
  const first = mulberry32(42);
  const second = mulberry32(42);
  const other = mulberry32(43);

  for (let index = 0; index < 5; index += 1) {
    assert.equal(first(), second());
  }

  assert.notEqual(mulberry32(42)(), other());
});

test("bootstrapMeanCi is seeded, ordered, and null for an empty input", () => {
  assert.deepEqual(bootstrapMeanCi([], 100, 7), { low: null, high: null });

  const first = bootstrapMeanCi([0, 0.1, 0.2], 200, 99);
  const second = bootstrapMeanCi([0, 0.1, 0.2], 200, 99);

  assert.deepEqual(first, second);
  assert.ok(first.low <= 0.1);
  assert.ok(first.high >= 0.1);
  assert.ok(first.low <= first.high);
});

test("Wilson interval stays inside 0..1 and narrows with more samples", () => {
  const empty = wilsonInterval(0, 0);

  assert.deepEqual(empty, { low: 0, high: 1, center: 0 });

  const ceiling = wilsonInterval(20, 20);
  const zero = wilsonInterval(0, 10);

  assert.equal(ceiling.center, 1);
  assert.equal(ceiling.high, 1);
  assert.ok(ceiling.low > 0.83 && ceiling.low < 0.85);

  assert.equal(zero.low, 0);
  assert.ok(zero.high > 0.27 && zero.high < 0.28);

  const broad = wilsonInterval(8, 10);
  const narrow = wilsonInterval(80, 100);

  assert.ok(narrow.high - narrow.low < broad.high - broad.low);
});

test("splitHalfQ95 is deterministic, bounded, and zero for one bucket", () => {
  const counts = { a: 12, b: 5, c: 3 };

  assert.equal(splitHalfQ95(counts), splitHalfQ95(counts));
  assert.equal(splitHalfQ95({}, 10, 1), 0);
  assert.equal(splitHalfQ95({ a: 1 }, 10, 1), 0);
  assert.equal(splitHalfQ95({ a: 20 }, 10, 1), 0);

  const value = splitHalfQ95(counts);

  assert.ok(value > 0 && value <= 1);
});
