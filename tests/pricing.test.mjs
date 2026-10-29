import assert from "node:assert/strict";
import test from "node:test";

import {
  averageMarginBps,
  blendedProfitMicros,
  clampMarkupBps,
  computeHoldMicros,
  computeTokenCostMicros,
  DEFAULT_MARKUP_BPS,
  defaultSellMicros,
  estimatePromptTokens,
  estimateTokensFromChars,
  estimateTokensFromText,
  marginBps,
  microsToPrice,
  priceToMicros,
  readMarkupInput,
  readPriceInput,
  readRequestedOutputBudget,
} from "../lib/pricing.ts";

test("prices round-trip between dollars per 1M and micros", () => {
  assert.equal(priceToMicros(0.0008), 800);
  assert.equal(priceToMicros(0.26), 260_000);
  assert.equal(microsToPrice(800), 0.0008);
  assert.equal(microsToPrice(2_000_000), 2);
});

test("default markup prices cost above zero and leaves free rows at zero", () => {
  assert.equal(defaultSellMicros(0, 3000), 0);
  assert.equal(defaultSellMicros(1000, 0), 1000);
  assert.equal(defaultSellMicros(1000, 3000), 1300);
  assert.equal(defaultSellMicros(333, 3000), 433);
  assert.equal(defaultSellMicros(1000, 100_000), 11_000);
  assert.equal(defaultSellMicros(-100, 3000), 0);
});

test("markup clamping is bounded and falls back to the default", () => {
  assert.equal(clampMarkupBps(DEFAULT_MARKUP_BPS), 3000);
  assert.equal(clampMarkupBps(-1), 0);
  assert.equal(clampMarkupBps(200_000), 100_000);
  assert.equal(clampMarkupBps(Number.NaN), DEFAULT_MARKUP_BPS);
  assert.equal(readMarkupInput(30), 30);
  assert.equal(readMarkupInput(-1), null);
  assert.equal(readMarkupInput(100_001), null);
});

test("margin handles free, zero-cost, and below-cost rows", () => {
  assert.equal(marginBps(1000, 1300), 2308);
  assert.equal(marginBps(0, 1000), 10_000);
  assert.equal(marginBps(1000, 500), -10_000);
  assert.equal(marginBps(1000, 0), null);
});

test("blended profit covers 1M input plus 1M output", () => {
  assert.equal(
    blendedProfitMicros({
      costInputMicros: 1000,
      costOutputMicros: 2000,
      sellInputMicros: 1300,
      sellOutputMicros: 2600,
    }),
    900,
  );
  assert.equal(
    blendedProfitMicros({
      costInputMicros: 1000,
      costOutputMicros: 1000,
      sellInputMicros: 500,
      sellOutputMicros: 500,
    }),
    -1000,
  );
});

test("token cost and holds use per-million micros", () => {
  assert.equal(computeTokenCostMicros(1_000_000, 1300), 1300);
  assert.equal(computeTokenCostMicros(0, 1300), 0);
  assert.equal(
    computeHoldMicros({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      sellInputMicros: 1300,
      sellOutputMicros: 2600,
    }),
    3900,
  );
  assert.equal(
    computeHoldMicros({
      inputTokens: 0,
      outputTokens: 0,
      sellInputMicros: 0,
      sellOutputMicros: 0,
    }),
    1,
  );
});


test("token estimation uses four characters per token", () => {
  assert.equal(estimateTokensFromText("12345678"), 2);
  assert.equal(estimateTokensFromText(""), 1);
  assert.equal(estimateTokensFromChars(0), 0);
  assert.equal(estimateTokensFromChars(1), 1);
  assert.equal(estimateTokensFromChars(8), 2);
  assert.ok(estimatePromptTokens([{ role: "user", content: "hello" }]) >= 1);
});

test("output budgets come from either token field", () => {
  assert.equal(readRequestedOutputBudget({}), null);
  assert.equal(readRequestedOutputBudget({ max_tokens: 512 }), 512);
  assert.equal(
    readRequestedOutputBudget({ max_tokens: 512, max_completion_tokens: 64 }),
    64,
  );
  assert.equal(readRequestedOutputBudget({ max_tokens: 0 }), null);
  assert.equal(readRequestedOutputBudget({ max_tokens: "512" }), null);
});

test("price inputs reject negatives and out-of-range values", () => {
  assert.equal(readPriceInput(0.0008), 800);
  assert.equal(readPriceInput(0), 0);
  assert.equal(readPriceInput(-1), null);
  assert.equal(readPriceInput(Number.NaN), null);
  assert.equal(readPriceInput(100_001), null);
});

test("average margin ignores unpriced rows", () => {
  assert.equal(
    averageMarginBps([{ margin: 1000 }, { margin: null }, { margin: -500 }]),
    250,
  );
  assert.equal(averageMarginBps([{ margin: null }]), null);
});
