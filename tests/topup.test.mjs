import assert from "node:assert/strict";
import test from "node:test";

import {
  TOPUP_MAX_USD,
  TOPUP_MIN_USD,
  parseTopupAmount,
} from "../lib/topup-amount.ts";

test("top-up amounts convert to exact cents and micros", () => {
  assert.deepEqual(parseTopupAmount("5"), {
    ok: true,
    amountMicros: 5_000_000,
    amountCents: 500,
    amountUsd: 5,
  });
  assert.deepEqual(parseTopupAmount("5.5"), {
    ok: true,
    amountMicros: 5_500_000,
    amountCents: 550,
    amountUsd: 5.5,
  });
  assert.deepEqual(parseTopupAmount("500.00"), {
    ok: true,
    amountMicros: 500_000_000,
    amountCents: 50_000,
    amountUsd: 500,
  });
  assert.equal(parseTopupAmount(25).ok, true);
  assert.equal(parseTopupAmount(" 10.25 ").ok, true);
});

test("top-up amounts stay inside the configured bounds", () => {
  assert.equal(parseTopupAmount(TOPUP_MIN_USD - 0.01).ok, false);
  assert.equal(parseTopupAmount(TOPUP_MAX_USD + 0.01).ok, false);
  assert.equal(parseTopupAmount("0").ok, false);
});

test("malformed amounts are rejected without floating-point rounding", () => {
  assert.equal(parseTopupAmount("5.001").ok, false);
  assert.equal(parseTopupAmount("5e2").ok, false);
  assert.equal(parseTopupAmount("05").ok, false);
  assert.equal(parseTopupAmount(".50").ok, false);
  assert.equal(parseTopupAmount("").ok, false);
  assert.equal(parseTopupAmount(null).ok, false);
  assert.equal(parseTopupAmount(Number.NaN).ok, false);
  assert.equal(parseTopupAmount(Number.POSITIVE_INFINITY).ok, false);
});

test("rejected amounts carry a readable error", () => {
  const low = parseTopupAmount("1");

  assert.equal(low.ok, false);
  assert.match(low.error, /\$5/);

  const high = parseTopupAmount("501");

  assert.equal(high.ok, false);
  assert.match(high.error, /\$500/);
});
