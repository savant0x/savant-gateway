import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_FREE_DAILY_WEIGHTED_TOKENS,
  DEFAULT_FREE_PROVIDER_ALERT_THRESHOLD,
  DEFAULT_FREE_PROVIDER_REMAINING_FLOOR,
  decideFreeAdmission,
  estimateWeightedTokens,
  nextUtcReset,
  readFreePoolConfig,
  secondsUntilReset,
} from "../lib/free-pool.ts";

const CONFIG = {
  dailyWeightedTokens: 500_000,
  providerRemainingFloor: 1_000_000,
  providerAlertThreshold: 2_000_000,
};

const NOW = Date.UTC(2026, 9, 29, 6, 0, 0);

function admission(overrides = {}) {
  return decideFreeAdmission({
    config: CONFIG,
    promptTokens: 1_000,
    outputBudget: 4_000,
    tokenWeight: 3,
    usedWeightedTokens: 0,
    reservedWeightedTokens: 0,
    providerRemaining: 10_000_000,
    providerAllowed: true,
    now: NOW,
    ...overrides,
  });
}

test("free-pool defaults are positive and configurable", () => {
  const defaults = readFreePoolConfig({});

  assert.equal(defaults.dailyWeightedTokens, DEFAULT_FREE_DAILY_WEIGHTED_TOKENS);
  assert.equal(defaults.providerRemainingFloor, DEFAULT_FREE_PROVIDER_REMAINING_FLOOR);
  assert.equal(
    defaults.providerAlertThreshold,
    DEFAULT_FREE_PROVIDER_ALERT_THRESHOLD,
  );

  const configured = readFreePoolConfig({
    FREE_DAILY_WEIGHTED_TOKENS: "250000",
    FREE_PROVIDER_REMAINING_FLOOR: "500000",
    FREE_PROVIDER_ALERT_THRESHOLD: "750000",
  });

  assert.deepEqual(configured, {
    dailyWeightedTokens: 250_000,
    providerRemainingFloor: 500_000,
    providerAlertThreshold: 750_000,
  });
});

test("free-pool config rejects non-positive and non-integer overrides", () => {
  const configured = readFreePoolConfig({
    FREE_DAILY_WEIGHTED_TOKENS: "0",
    FREE_PROVIDER_REMAINING_FLOOR: "-5",
    FREE_PROVIDER_ALERT_THRESHOLD: "1.5",
  });

  assert.equal(configured.dailyWeightedTokens, DEFAULT_FREE_DAILY_WEIGHTED_TOKENS);
  assert.equal(configured.providerRemainingFloor, DEFAULT_FREE_PROVIDER_REMAINING_FLOOR);
  assert.equal(
    configured.providerAlertThreshold,
    DEFAULT_FREE_PROVIDER_ALERT_THRESHOLD,
  );
});

test("weighted estimates apply the provider model weight", () => {
  assert.equal(estimateWeightedTokens(1_000, 4_000, 3), 15_000);
  assert.equal(estimateWeightedTokens(1_000, 4_000, 0), 5_000);
  assert.equal(estimateWeightedTokens(0, 0, 1), 1);
});

test("admission allows a request inside the daily allowance", () => {
  const decision = admission();

  assert.equal(decision.allowed, true);
  assert.equal(decision.estimatedWeightedTokens, 15_000);
  assert.equal(decision.alert, false);
});

test("in-flight reservations count toward the daily allowance", () => {
  const decision = admission({
    usedWeightedTokens: 200_000,
    reservedWeightedTokens: 290_000,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "user_allowance");
  assert.equal(decision.status, 429);
  assert.equal(decision.type, "rate_limit_error");
  assert.match(decision.message, /Daily free-tier allowance reached/);
  assert.equal(decision.resetAt, "2026-10-30T00:00:00.000Z");
  assert.equal(decision.retryAfterSeconds, 64_800);
});

test("an allowance boundary is inclusive", () => {
  const exact = admission({
    usedWeightedTokens: 485_000,
    reservedWeightedTokens: 0,
  });

  assert.equal(exact.allowed, true);

  const over = admission({
    usedWeightedTokens: 485_001,
    reservedWeightedTokens: 0,
  });

  assert.equal(over.allowed, false);
  assert.equal(over.reason, "user_allowance");
});

test("the provider-remaining floor blocks free calls", () => {
  const decision = admission({ providerRemaining: CONFIG.providerRemainingFloor - 1 });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "provider_pool");
  assert.equal(decision.status, 429);
  assert.equal(decision.type, "insufficient_quota");
  assert.equal(decision.retryAfterSeconds, 300);
});

test("a provider that disallows free calls blocks admission", () => {
  const decision = admission({ providerAllowed: false });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "provider_blocked");
  assert.equal(decision.status, 429);
});

test("an unknown provider remaining still enforces the user allowance", () => {
  const allowed = admission({ providerRemaining: null });

  assert.equal(allowed.allowed, true);
  assert.equal(allowed.alert, false);

  const blocked = admission({
    providerRemaining: null,
    usedWeightedTokens: 500_000,
  });

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "user_allowance");
});

test("a low provider pool raises the alert flag but still admits", () => {
  const decision = admission({
    providerRemaining: CONFIG.providerAlertThreshold,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.alert, true);
});

test("reset helpers point at the next UTC midnight", () => {
  assert.equal(nextUtcReset(NOW).toISOString(), "2026-10-30T00:00:00.000Z");
  assert.equal(secondsUntilReset(NOW), 64_800);
  assert.equal(secondsUntilReset(Date.UTC(2026, 9, 29, 23, 59, 59)), 60);
});
