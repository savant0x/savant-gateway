import assert from "node:assert/strict";
import test from "node:test";

import {
  marginBuckets,
  priceHistorySeries,
  routeMix,
} from "../lib/pricing-chart-data.ts";

function model(overrides = {}) {
  return {
    id: "m1",
    upstreamSlug: "savant",
    name: "Model One",
    access: "paid",
    inCatalog: true,
    costSource: "synced",
    costObservedAt: null,
    costInputPer1M: 2,
    costOutputPer1M: 8,
    inputPricePer1M: 3,
    outputPricePer1M: 10,
    servedProviderSlug: null,
    ...overrides,
  };
}

function decision(overrides = {}) {
  return {
    id: "pd_1",
    modelId: "m1",
    modelName: "Model One",
    actor: "admin-session",
    reason: "review",
    costSource: "synced",
    costInputMicros: 1_000,
    costOutputMicros: 2_000,
    beforeInputMicros: 1_200,
    beforeOutputMicros: 2_400,
    afterInputMicros: 1_500,
    afterOutputMicros: 3_000,
    targetMarginBps: 3_000,
    rounding: "micro",
    recommendation: {},
    createdAt: "2026-11-03T12:00:00.000Z",
    ...overrides,
  };
}

test("margin buckets count paid catalog rows and keep negatives apart", () => {
  const buckets = marginBuckets([
    model(),
    model({ id: "m2", costInputPer1M: 10, costOutputPer1M: 10 }),
    model({ id: "m3", access: "free" }),
  ]);

  assert.equal(
    buckets.reduce((total, bucket) => total + bucket.count, 0),
    2,
  );
  assert.equal(buckets[0].negative, true);
  assert.equal(buckets[0].count, 1);
  assert.ok(buckets.some((bucket) => bucket.count === 1 && !bucket.negative));
});

test("price history is one averaged point per UTC day", () => {
  const series = priceHistorySeries([
    decision(),
    decision({
      id: "pd_2",
      afterInputMicros: 2_500,
      afterOutputMicros: 5_000,
      createdAt: "2026-11-03T18:00:00.000Z",
    }),
    decision({
      id: "pd_3",
      afterInputMicros: 3_500,
      afterOutputMicros: 7_000,
      createdAt: "2026-11-04T08:00:00.000Z",
    }),
  ]);

  assert.deepEqual(series, [
    {
      date: "2026-11-03",
      averageInputMicros: 2_000,
      averageOutputMicros: 4_000,
      changes: 2,
    },
    {
      date: "2026-11-04",
      averageInputMicros: 3_500,
      averageOutputMicros: 7_000,
      changes: 1,
    },
  ]);
  assert.deepEqual(priceHistorySeries([]), []);
});

test("route mix counts catalog rows and the rows that serve", () => {
  const mix = routeMix([
    model(),
    model({ id: "m2", servedProviderSlug: "commandcode" }),
    model({
      id: "m3",
      upstreamSlug: "commandcode",
      servedProviderSlug: "commandcode",
    }),
    model({ id: "m4", inCatalog: false }),
  ]);

  assert.deepEqual(mix, [
    { provider: "savant", models: 2, served: 1 },
    { provider: "commandcode", models: 1, served: 1 },
  ]);
});
