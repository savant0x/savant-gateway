import assert from "node:assert/strict";
import test from "node:test";

import { parseProviderBalance } from "../lib/provider-quota.ts";

/**
 * Two balance envelopes (FID-2026-1122-002).
 *
 * The default provider publishes `balance_usd` plus per-key limits. A
 * marketplace wallet publishes `balances.consumer_balance` and nothing else, and
 * an unfunded account publishes an empty `balances` object. The second shape must
 * read as `$0` rather than "unavailable", while an unreadable value must still
 * throw — a broken provider cannot be allowed to look like a zero wallet.
 */
test("the default envelope keeps its limits", () => {
  const balance = parseProviderBalance({
    balance_usd: 12.5,
    rpm: 60,
    rpm_plan: "standard",
    api_key: {
      spend_limit_usd: 20,
      spent_usd: 7.5,
      remaining_usd: 12.5,
      limit_reached: false,
    },
  });

  assert.equal(balance.balanceUsd, 12.5);
  assert.equal(balance.rpm, 60);
  assert.equal(balance.rpmPlan, "standard");
  assert.equal(balance.spendLimitUsd, 20);
  assert.equal(balance.spentUsd, 7.5);
  assert.equal(balance.remainingUsd, 12.5);
  assert.equal(balance.limitReached, false);
});

test("a wallet envelope reads as a balance with no limits", () => {
  const balance = parseProviderBalance({
    id: "acct_1",
    status: "active",
    roles: ["consumer"],
    balances: { consumer_balance: "3.25" },
  });

  assert.equal(balance.balanceUsd, 3.25);
  assert.equal(balance.rpm, null);
  assert.equal(balance.spendLimitUsd, null);
  assert.equal(balance.remainingUsd, null);
  assert.equal(balance.limitReached, false);
});

test("an empty wallet is zero, not unknown", () => {
  assert.equal(parseProviderBalance({ balances: {} }).balanceUsd, 0);
  assert.equal(
    parseProviderBalance({ balances: { consumer_balance: "" } }).balanceUsd,
    0,
  );
});

test("an unreadable balance still throws", () => {
  assert.throws(() => parseProviderBalance({}), /unknown balance/);
  assert.throws(() => parseProviderBalance([]), /unknown balance/);
  assert.throws(
    () => parseProviderBalance({ balances: { consumer_balance: "lots" } }),
    /unknown balance/,
  );
  assert.throws(
    () => parseProviderBalance({ balance_usd: -1 }),
    /unknown balance/,
  );
});
