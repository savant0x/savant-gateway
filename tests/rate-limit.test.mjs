import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PAID_KEY_RPM,
  completionBucket,
  evaluateCompletionRate,
  readRateLimitConfig,
} from "../lib/gateway-rate-limit.ts";
import {
  freshBucket,
  retryAfterSeconds,
  takeToken,
} from "../lib/token-bucket.ts";

const MINUTE = 60_000;

test("a fresh bucket admits its whole capacity, then refuses", () => {
  const config = { capacity: 3, refillPerMinute: 3 };
  let state;

  for (let index = 0; index < 3; index += 1) {
    const decision = takeToken(state, 1_000, config);

    assert.equal(decision.allowed, true);
    state = decision.state;
  }

  const blocked = takeToken(state, 1_000, config);

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterMs, 20_000);
});

test("tokens refill at the configured rate and never exceed capacity", () => {
  const config = { capacity: 2, refillPerMinute: 2 };
  const empty = { tokens: 0, updatedAt: 0 };

  const afterHalfMinute = takeToken(empty, MINUTE / 2, config);

  assert.equal(afterHalfMinute.allowed, true);
  assert.equal(afterHalfMinute.state.tokens, 0);

  const afterAnHour = takeToken(empty, 60 * MINUTE, config);

  assert.equal(afterAnHour.state.tokens, 1);
  assert.equal(
    takeToken(afterAnHour.state, 120 * MINUTE, config).state.tokens,
    1,
  );
});

test("a clock moving backwards refills nothing and rebases the bucket", () => {
  const config = { capacity: 5, refillPerMinute: 5 };
  const decision = takeToken({ tokens: 0, updatedAt: 10 * MINUTE }, 0, config);

  assert.equal(decision.allowed, false);
  assert.equal(decision.state.updatedAt, 0);
  assert.equal(decision.state.tokens, 0);
});

test("retry-after seconds are never below one", () => {
  assert.equal(retryAfterSeconds(0), 1);
  assert.equal(retryAfterSeconds(400), 1);
  assert.equal(retryAfterSeconds(20_400), 21);
});

test("a fresh bucket starts full so the first burst is never throttled", () => {
  assert.deepEqual(freshBucket({ capacity: 4, refillPerMinute: 4 }, 50), {
    tokens: 4,
    updatedAt: 50,
  });
});

test("limits default under the upstream ceiling and read overrides", () => {
  assert.deepEqual(readRateLimitConfig({}), {
    paidKeyRpm: DEFAULT_PAID_KEY_RPM,
  });

  const overridden = readRateLimitConfig({ PAID_KEY_RPM: "6" });

  assert.deepEqual(overridden, { paidKeyRpm: 6 });
});

test("malformed limits fall back instead of disabling the control", () => {
  for (const value of ["", "0", "-5", "abc", "2.5"]) {
    const config = readRateLimitConfig({ PAID_KEY_RPM: value });

    assert.equal(config.paidKeyRpm, DEFAULT_PAID_KEY_RPM, value);
  }
});

test("completion buckets are isolated by account, not by key", () => {
  const alphaA = completionBucket({ keyId: "a1", userId: "alpha" });
  const alphaB = completionBucket({ keyId: "a2", userId: "alpha" });
  const beta = completionBucket({ keyId: "b1", userId: "beta" });

  assert.equal(alphaA.key, alphaB.key);
  assert.notEqual(alphaA.key, beta.key);
  assert.equal(alphaA.limit, DEFAULT_PAID_KEY_RPM);

  let state;
  const run = () => {
    const outcome = evaluateCompletionRate({ state, now: 0, limit: 1 });

    state = outcome.state;

    return outcome.decision;
  };

  assert.equal(run().allowed, true);
  assert.equal(run().allowed, false);
});

test("a bucket recovers its allowance over the minute", () => {
  const first = evaluateCompletionRate({
    state: undefined,
    now: 0,
    limit: 1,
  });

  assert.equal(first.decision.allowed, true);

  const blocked = evaluateCompletionRate({
    state: first.state,
    now: 0,
    limit: 1,
  });

  assert.equal(blocked.decision.allowed, false);

  const recovered = evaluateCompletionRate({
    state: blocked.state,
    now: MINUTE,
    limit: 1,
  });

  assert.equal(recovered.decision.allowed, true);
});
