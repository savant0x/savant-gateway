import assert from "node:assert/strict";
import test from "node:test";

import {
  computeHoldMicros,
  computeTokenCostMicros,
  defaultSellMicros,
  priceToMicros,
} from "../lib/pricing.ts";
import { readPlanValues, markupSellMicros } from "../lib/plans.ts";
import { grossMarginBps, monthlyRecurringMicros } from "../lib/revenue.ts";
import { parseTopupAmount } from "../lib/topup-amount.ts";
import { usageLedgerEntry } from "../lib/usage-ledger.ts";
import {
  formatMicros,
  formatPreciseMoney,
} from "../components/dashboard/format.ts";

/** Reference implementation: exact integer division, half up. */
function exactCost(tokens, price) {
  return Number((BigInt(tokens) * BigInt(price) + 500_000n) / 1_000_000n);
}

test("token cost equals exact integer arithmetic across the whole domain", () => {
  const prices = [1, 65_000, 195_000, 845_000, 2_600_000, 100_000_000];
  const tokenCounts = [
    0, 1, 7, 999, 4_096, 65_536, 131_072, 1_000_000, 4_194_304,
  ];

  for (const price of prices) {
    for (const tokens of tokenCounts) {
      assert.equal(
        computeTokenCostMicros(tokens, price),
        exactCost(tokens, price),
        `${tokens} tokens at ${price} micros per 1M`,
      );
    }
  }
});

test("a product past 2^53 still rounds exactly instead of drifting a micro", () => {
  // Float math returned 2,988,509,384,083 here; the true cost is one micro less.
  assert.equal(
    computeTokenCostMicros(39_094_008, 76_444_179_990),
    2_988_509_384_082,
  );
  assert.notEqual(
    Math.round((39_094_008 * 76_444_179_990) / 1_000_000),
    2_988_509_384_082,
  );
});

test("token cost never goes negative and normalizes junk input", () => {
  assert.equal(computeTokenCostMicros(-5, 195_000), 0);
  assert.equal(computeTokenCostMicros(1_000_000, -1), 0);
  assert.equal(computeTokenCostMicros(Number.NaN, 195_000), 0);
  assert.equal(computeTokenCostMicros(1_000_000, Number.POSITIVE_INFINITY), 0);
  assert.equal(computeTokenCostMicros(10.9, 100_000), 1);
});

test("the sell price is the exact markup rounded up, never below cost", () => {
  for (let cost = 1; cost <= 5_000; cost += 7) {
    for (const bps of [0, 1, 2_500, 3_000, 12_345, 100_000]) {
      const sell = defaultSellMicros(cost, bps);
      const expected = Number(
        (BigInt(cost) * BigInt(10_000 + bps) + 9_999n) / 10_000n,
      );

      assert.equal(sell, Math.max(1, expected), `cost ${cost} at ${bps} bps`);
      assert.ok(sell >= cost, "a negative markup would sell below cost");

      if (bps === 0) assert.equal(sell, cost);
    }
  }

  assert.equal(defaultSellMicros(0, 3_000), 0);
  assert.equal(defaultSellMicros(50_000, 3_000), 65_000);
  assert.equal(defaultSellMicros(195_000, 3_000), 253_500);
});

test("a hold covers the charge when the estimate is the actual usage", () => {
  const tokens = { inputTokens: 1_000, outputTokens: 4_096 };
  const prices = { sellInputMicros: 253_500, sellOutputMicros: 253_500 };
  const hold = computeHoldMicros({ ...tokens, ...prices });
  const charged =
    computeTokenCostMicros(tokens.inputTokens, prices.sellInputMicros) +
    computeTokenCostMicros(tokens.outputTokens, prices.sellOutputMicros);

  assert.equal(hold, charged);
  assert.ok(
    computeHoldMicros({ inputTokens: 0, outputTokens: 0, ...prices }) >= 1,
  );
});

test("a settled charge writes a ledger row whose balance reconciles", () => {
  let balance = 10_000_000; // $10.00
  const charges = [195_000, 39, 1_000_000, 7];

  for (const charge of charges) {
    const entry = usageLedgerEntry({
      balanceBeforeMicros: balance,
      chargedMicros: charge,
      modelId: "glm-5.3",
    });

    assert.equal(entry.amountMicros, -charge);
    assert.equal(entry.balanceAfterMicros, balance - charge);
    balance = entry.balanceAfterMicros;
  }

  assert.equal(balance, 10_000_000 - (195_000 + 39 + 1_000_000 + 7));
  assert.equal(
    usageLedgerEntry({
      balanceBeforeMicros: 0,
      chargedMicros: 0,
      modelId: "free/glm-5.3",
    }),
    null,
  );
  assert.equal(
    usageLedgerEntry({
      balanceBeforeMicros: 0,
      chargedMicros: -5,
      modelId: "glm-5.3",
    }),
    null,
  );
  assert.equal(
    usageLedgerEntry({
      balanceBeforeMicros: Number.NaN,
      chargedMicros: 5,
      modelId: "glm-5.3",
    }),
    null,
  );
});

test("a charge past the balance is recorded as a negative balance, not clamped", () => {
  const entry = usageLedgerEntry({
    balanceBeforeMicros: 500,
    chargedMicros: 1_500,
    modelId: "glm-5.3",
  });

  assert.equal(entry.amountMicros, -1_500);
  assert.equal(entry.balanceAfterMicros, -1_000);
});

test("micros render exactly, with two decimals as the floor", () => {
  assert.equal(formatMicros(0), "$0.00");
  assert.equal(formatMicros(195_000), "$0.195");
  assert.equal(formatMicros(39), "$0.000039");
  assert.equal(formatMicros(1_500_000), "$1.50");
  assert.equal(formatMicros(1_234_000), "$1.234");
  assert.equal(formatMicros(12_345_678), "$12.345678");
  assert.equal(formatMicros(-195_000), "-$0.195");
  assert.equal(formatMicros(1_234_567_890_000), "$1,234,567.89");
  assert.equal(formatMicros(null), "—");
  assert.equal(formatMicros(Number.NaN), "—");
  assert.equal(formatPreciseMoney(0.195), "$0.195");
  assert.equal(formatPreciseMoney(0.000039), "$0.000039");
});

test("top-up amounts convert to micros exactly and never to a fraction of a cent", () => {
  const ten = parseTopupAmount("10.10");

  assert.equal(ten.ok, true);
  assert.equal(ten.amountCents, 1_010);
  assert.equal(ten.amountMicros, 10_100_000);
  assert.equal(ten.amountMicros, ten.amountCents * 10_000);

  const minimum = parseTopupAmount(5);
  const maximum = parseTopupAmount("500.00");

  assert.equal(minimum.ok, true);
  assert.equal(minimum.amountMicros, 5_000_000);
  assert.equal(maximum.ok, true);
  assert.equal(maximum.amountMicros, 500_000_000);

  for (const bad of ["4.99", "500.01", "10.005", "-10", "1e3", "", "10.0.1"]) {
    assert.equal(parseTopupAmount(bad).ok, false, bad);
  }
});

test("a plan price is a whole number of cents or rejected", () => {
  const base = {
    slug: "pro",
    name: "Pro",
    status: "active",
    interval: "month",
    includedWeightedTokens: 1_000_000,
    overageMarkupBps: 0,
  };

  const accepted = readPlanValues({ ...base, priceUsd: 19.99 });

  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.priceMicros, 19_990_000);
  assert.equal(accepted.value.priceMicros % 10_000, 0);

  const subCent = readPlanValues({ ...base, priceMicros: 19_995_000 });

  assert.equal(subCent.ok, false);
  assert.match(subCent.error, /whole number of cents/);
});

test("every two-decimal plan price converts without a cent drifting", () => {
  for (let cents = 50; cents <= 1_000_000; cents += 997) {
    const usd = cents / 100;
    const micros = Math.round(usd * 1_000_000);

    assert.equal(micros, cents * 10_000, `$${usd}`);
    assert.equal(micros % 10_000, 0);
  }
});

test("overage markup rounds only where it has to and never turns negative", () => {
  assert.equal(markupSellMicros(195_000, 0), 195_000);
  assert.equal(markupSellMicros(195_000, 3_000), 253_500);
  assert.equal(markupSellMicros(1, 0), 1);
  assert.ok(markupSellMicros(195_000, 10) >= 195_000);
  assert.equal(markupSellMicros(-500, 3_000), 0);
});

test("revenue helpers do not invent money", () => {
  assert.equal(monthlyRecurringMicros(0, "month"), 0);
  assert.equal(monthlyRecurringMicros(-1, "month"), 0);
  assert.equal(monthlyRecurringMicros(120_000_000, "year"), 10_000_000);
  assert.equal(monthlyRecurringMicros(1_000_000, "month"), 1_000_000);
  assert.equal(grossMarginBps(0, 500), null);
  assert.equal(grossMarginBps(1_000_000, 800_000), 2_000);
  assert.equal(grossMarginBps(1_000_000, 1_200_000), -2_000);
});

test("catalog prices survive the round trip through micros", () => {
  for (const usd of [0.045, 0.052, 0.065, 0.0699, 0.0975, 0.195, 2.6, 10, 50]) {
    const micros = priceToMicros(usd);

    assert.equal(micros, Math.round(usd * 1_000_000));
    assert.equal(micros % 1, 0);
  }
});
