import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogEconomics,
  freePoolEconomics,
  providerPivot,
} from "../lib/business-model.ts";

function row(overrides = {}) {
  return {
    id: "model",
    group: "paid",
    costInputMicros: 100_000,
    costOutputMicros: 400_000,
    sellInputMicros: 130_000,
    sellOutputMicros: 520_000,
    tokenWeight: 0,
    ...overrides,
  };
}

test("catalog counts each group and averages only priced rows", () => {
  const result = catalogEconomics(
    [
      row({ id: "a" }),
      row({ id: "b", costInputMicros: 300_000, sellInputMicros: 390_000 }),
      row({
        id: "free",
        group: "free",
        costInputMicros: 0,
        sellInputMicros: 0,
      }),
      row({
        id: "plan",
        group: "subscription",
        costInputMicros: 0,
        sellInputMicros: 0,
      }),
    ],
    3000,
  );

  assert.equal(result.rows, 4);
  assert.equal(result.freePool, 1);
  assert.equal(result.subscriptionOnly, 1);
  assert.equal(result.priced, 2);
  assert.equal(result.cheapestPaidInputMicros, 100_000);
  assert.equal(result.priciestPaidInputMicros, 300_000);
  assert.equal(result.medianPaidInputMicros, 200_000);
  assert.equal(result.groups[1].priced, 2);
  assert.equal(result.groups[1].meanInputSellMicros, 260_000);
});

test("gross margin is measured on revenue, not on cost", () => {
  const result = catalogEconomics([row()], 3000);

  // Sell 130_000 against cost 100_000 is 23.08% of revenue, not 30% of cost.
  assert.equal(result.grossMarginBpsOnPaid, 2308);
});

test("a catalog with no priced rows reports null instead of zero", () => {
  const result = catalogEconomics(
    [row({ costInputMicros: 0, sellInputMicros: 0 })],
    3000,
  );

  assert.equal(result.grossMarginBpsOnPaid, null);
  assert.equal(result.medianPaidInputMicros, null);
  assert.equal(result.groups[1].grossMarginBps, null);
});

test("free pool splits the share and prices a month of it", () => {
  const result = freePoolEconomics({
    dailyWeightedTokens: 20_000_000,
    shareBps: 9000,
    per1MMicros: { cheapest: 40_000, median: 150_000, priciest: 2_000_000 },
  });

  assert.equal(result.allocatableTokens, 18_000_000);
  assert.equal(result.reserveTokens, 2_000_000);
  assert.equal(result.monthlyAllocatableTokens, 540_000_000);
  assert.equal(result.monthlyCostMicros.cheapest, 21_600_000);
  assert.equal(result.monthlyCostMicros.median, 81_000_000);
  assert.equal(result.monthlyCostMicros.priciest, 1_080_000_000);
});

test("free pool clamps a share above 100% and tolerates missing prices", () => {
  const result = freePoolEconomics({
    dailyWeightedTokens: 1_000_000,
    shareBps: 25_000,
    per1MMicros: { cheapest: null, median: null, priciest: null },
  });

  assert.equal(result.allocatableTokens, 1_000_000);
  assert.equal(result.reserveTokens, 0);
  assert.equal(result.monthlyCostMicros.median, null);
});

test("pivot reports only rows an alternative sells cheaper", () => {
  const rows = [
    { id: "cheaper", costInputMicros: 300_000, costOutputMicros: 600_000 },
    { id: "pricier", costInputMicros: 100_000, costOutputMicros: 200_000 },
    { id: "missing", costInputMicros: 500_000, costOutputMicros: 500_000 },
  ];
  const alternatives = {
    cheaper: {
      provider: "Apixo",
      inputPer1MMicros: 200_000,
      outputPer1MMicros: 300_000,
    },
    pricier: {
      provider: "Apixo",
      inputPer1MMicros: 400_000,
      outputPer1MMicros: 400_000,
    },
  };

  const result = providerPivot(rows, alternatives);

  assert.deepEqual(
    result.map((entry) => entry.id),
    ["cheaper"],
  );
  assert.equal(result[0].inputSavingBps, 3333);
  assert.equal(result[0].outputSavingBps, 5000);
  assert.equal(result[0].alternativeProvider, "Apixo");
});

test("pivot ignores a zero-cost current row instead of reporting an infinite saving", () => {
  const result = providerPivot(
    [{ id: "free", costInputMicros: 0, costOutputMicros: 0 }],
    {
      free: {
        provider: "Apixo",
        inputPer1MMicros: 100_000,
        outputPer1MMicros: 100_000,
      },
    },
  );

  assert.deepEqual(result, []);
});
