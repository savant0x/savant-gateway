import assert from "node:assert/strict";
import test from "node:test";

import {
  recommendPrices,
  recommendationSummary,
  sellForMargin,
} from "../lib/price-recommendation.ts";
import { MAX_PRICE_MICROS } from "../lib/pricing.ts";

const NOW = new Date("2026-11-03T12:00:00.000Z");

function input(overrides = {}) {
  return {
    access: "paid",
    costInputMicros: 2_000_000,
    costOutputMicros: 8_000_000,
    currentInputMicros: 2_500_000,
    currentOutputMicros: 10_000_000,
    costSource: "synced",
    costObservedAt: "2026-11-03T09:00:00.000Z",
    targetMarginBps: 3_000,
    now: NOW,
    ...overrides,
  };
}

test("a recommendation rounds up to the requested margin", () => {
  assert.equal(sellForMargin(2_000_000, 3_000), 2_857_143);

  const result = recommendPrices(input());

  assert.equal(result.eligible, true);
  assert.equal(result.inputMicros, 2_857_143);
  assert.equal(result.outputMicros, 11_428_572);
  assert.ok((result.inputMarginBps ?? 0) >= 3_000);
  assert.equal(result.costBasis, "synced");
  assert.match(recommendationSummary(result), /2\.8571 in/);
});

test("free, subscription, unknown and stale costs are ineligible", () => {
  for (const [overrides, pattern] of [
    [{ access: "free" }, /free group/],
    [{ access: "subscription" }, /subscription pricing/i],
    [{ costSource: "unknown" }, /cost is unknown/i],
    [
      { costSource: "manual", costObservedAt: "2026-09-01T00:00:00.000Z" },
      /stale/i,
    ],
  ]) {
    const result = recommendPrices(input(overrides));

    assert.equal(result.eligible, false);
    assert.match(result.reason, pattern);
  }
});

test("an invalid target margin and the price ceiling refuse approval", () => {
  assert.equal(
    recommendPrices(input({ targetMarginBps: 10_000 })).eligible,
    false,
  );
  assert.equal(recommendPrices(input({ targetMarginBps: -1 })).eligible, false);

  const ceiling = recommendPrices(
    input({
      costInputMicros: MAX_PRICE_MICROS,
      costOutputMicros: MAX_PRICE_MICROS,
      targetMarginBps: 5_000,
    }),
  );

  assert.equal(ceiling.eligible, false);
  assert.match(ceiling.reason, /ceiling/);
});

test("cent rounding and the minimum publishable price are explicit", () => {
  const cents = recommendPrices(
    input({ rounding: "cent", targetMarginBps: 2_500 }),
  );

  assert.equal(cents.inputMicros % 10_000, 0);
  assert.equal(cents.outputMicros % 10_000, 0);

  const zeroCost = recommendPrices(
    input({
      costInputMicros: 0,
      costOutputMicros: 0,
      currentInputMicros: 0,
      currentOutputMicros: 0,
    }),
  );

  assert.equal(zeroCost.eligible, true);
  assert.equal(zeroCost.inputMicros, 1);
  assert.match(zeroCost.warnings.join(" "), /zero cost/i);
});

test("a large price move is a warning, not a silent approval", () => {
  const result = recommendPrices(
    input({
      currentInputMicros: 1_000_000,
      currentOutputMicros: 8_000_000,
      targetMarginBps: 5_000,
    }),
  );

  assert.equal(result.eligible, true);
  assert.match(result.warnings.join(" "), /exceeds \+100%/);
});
