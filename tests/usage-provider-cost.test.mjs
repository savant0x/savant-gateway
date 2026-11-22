import assert from "node:assert/strict";
import test from "node:test";

import {
  estimatedUsage,
  mergeProviderUsage,
  readProviderUsage,
  resolveUsage,
} from "../lib/usage.ts";

/**
 * The provider's own charge.
 *
 * A provider that reports what it charged is telling us something the price
 * table cannot: which publisher tier actually served the request. That figure is
 * stored for reconciliation and never becomes a billing basis, so the tests keep
 * two promises — the number survives the parse exactly, and "did not report"
 * never turns into "charged zero".
 */

test("a reported charge becomes integer micro-dollars", () => {
  const usage = readProviderUsage({
    usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0004356 },
  });

  assert.equal(usage?.costMicros, 436);
});

test("a string charge parses and rounds half up", () => {
  const usage = readProviderUsage({
    usage: { prompt_tokens: 1, completion_tokens: 1, cost: "0.0000015" },
  });

  assert.equal(usage?.costMicros, 2);
});

test("an exact zero is a reported zero, not an absence", () => {
  const usage = readProviderUsage({
    usage: { prompt_tokens: 3, completion_tokens: 2, cost: 0 },
  });

  assert.equal(usage?.costMicros, 0);
});

test("a total_cost field is read when cost is absent", () => {
  const usage = readProviderUsage({
    usage: { prompt_tokens: 3, completion_tokens: 2, total_cost: 0.000012 },
  });

  assert.equal(usage?.costMicros, 12);
});

test("an unusable charge is absent, never zero", () => {
  for (const cost of [-1, "abc", "", Number.NaN, Infinity, null, {}, [0.5]]) {
    const usage = readProviderUsage({
      usage: { prompt_tokens: 3, completion_tokens: 2, cost },
    });

    assert.equal(usage?.costMicros, null, `cost ${String(cost)}`);
  }
});

test("a figure that cannot be one request's charge is refused", () => {
  // A credit balance or a lifetime total in the same field would otherwise be
  // stored as if this request had cost it.
  const usage = readProviderUsage({
    usage: { prompt_tokens: 3, completion_tokens: 2, cost: 5000 },
  });

  assert.equal(usage?.costMicros, null);
});

test("a later frame that omits the charge keeps the earlier one", () => {
  const reported = readProviderUsage({
    usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0002 },
  });
  const tokensOnly = readProviderUsage({
    usage: { prompt_tokens: 20, completion_tokens: 8 },
  });
  const merged = mergeProviderUsage(reported, tokensOnly);

  assert.equal(merged?.inputTokens, 20);
  assert.equal(merged?.costMicros, 200);
});

test("a later frame's charge replaces the earlier one", () => {
  const first = readProviderUsage({
    usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0002 },
  });
  const second = readProviderUsage({
    usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0009 },
  });

  assert.equal(mergeProviderUsage(first, second)?.costMicros, 900);
});

test("the resolved shape carries the charge, and an estimate has none", () => {
  const reported = resolveUsage({
    usage: readProviderUsage({
      usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0003 },
    }),
    fallbackInputTokens: 0,
    fallbackOutputTokens: 0,
  });

  assert.equal(reported.providerCostMicros, 300);
  assert.equal(estimatedUsage(10, 5).providerCostMicros, null);
});

test("a provider that reports tokens but no charge leaves the cost absent", () => {
  const resolved = resolveUsage({
    usage: readProviderUsage({
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    fallbackInputTokens: 0,
    fallbackOutputTokens: 0,
  });

  assert.equal(resolved.complete, true);
  assert.equal(resolved.providerCostMicros, null);
});
