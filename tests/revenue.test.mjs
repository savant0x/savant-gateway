import assert from "node:assert/strict";
import test from "node:test";

import { grossMarginBps, monthlyRecurringMicros } from "../lib/revenue.ts";

test("monthly plans keep their snapshot price", () => {
  assert.equal(monthlyRecurringMicros(10_000_000, "month"), 10_000_000);
  assert.equal(monthlyRecurringMicros(500_000, "month"), 500_000);
});

test("yearly plans normalize to a monthly run-rate", () => {
  assert.equal(monthlyRecurringMicros(120_000_000, "year"), 10_000_000);
  assert.equal(monthlyRecurringMicros(100, "year"), 8);
});

test("non-positive and non-finite prices produce zero MRR", () => {
  assert.equal(monthlyRecurringMicros(0, "month"), 0);
  assert.equal(monthlyRecurringMicros(-1, "month"), 0);
  assert.equal(monthlyRecurringMicros(Number.NaN, "year"), 0);
  assert.equal(monthlyRecurringMicros(Number.POSITIVE_INFINITY, "year"), 0);
});

test("gross margin is revenue minus cost in basis points", () => {
  assert.equal(grossMarginBps(100, 40), 6_000);
  assert.equal(grossMarginBps(163_000_000, 1_500_000), 9_908);
  assert.equal(grossMarginBps(100, 140), -4_000);
});

test("gross margin is undefined without a positive revenue base", () => {
  assert.equal(grossMarginBps(0, 10), null);
  assert.equal(grossMarginBps(-100, 10), null);
  assert.equal(grossMarginBps(Number.NaN, 10), null);
  assert.equal(grossMarginBps(100, Number.NaN), null);
});
