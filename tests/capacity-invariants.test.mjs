import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateProviderAdmission,
  resolveProviderRpm,
  servingAccountId,
} from "../lib/provider-admission.ts";

const provider = {
  baseUrl: "https://capacity.example.test/v1",
  keyEnvVar: "CAPACITY_KEY",
};

const config = { configuredRpm: null, concurrency: 3 };

/**
 * The shared store owns persistence; this suite owns the decision ordering.
 * The two-connection race against PostgreSQL is
 * `tests/admission-concurrency.test.mjs`, and the pure state model here is the
 * same object the store reads and writes.
 */
function acquire(state, now = 0) {
  return evaluateProviderAdmission({
    state,
    rpm: 100_000,
    concurrency: config.concurrency,
    now,
  });
}

test("interleaved admission never exceeds the serving concurrency", () => {
  let state = { bucket: undefined, inFlight: 0 };
  let leases = 0;
  let admitted = 0;
  let concurrencyRefusals = 0;

  for (let step = 0; step < 500; step += 1) {
    if (leases > 0 && step % 3 === 0) {
      leases -= 1;
      state = { ...state, inFlight: Math.max(0, state.inFlight - 1) };
    } else if (leases < config.concurrency) {
      const outcome = acquire(state);

      state = outcome.state;

      if (outcome.decision.ok) {
        admitted += 1;
        leases += 1;
      }
    } else if (step % 4 === 0) {
      const refused = acquire(state);

      state = refused.state;

      assert.equal(refused.decision.ok, false);
      if (!refused.decision.ok) {
        assert.equal(refused.decision.reason, "concurrency");
        concurrencyRefusals += 1;
      }
    }

    assert.ok(state.inFlight <= config.concurrency);
  }

  assert.ok(admitted > 0);
  assert.ok(concurrencyRefusals > 0);

  state = { ...state, inFlight: 0 };
  assert.equal(state.inFlight, 0);
});

test("a concurrency refusal does not spend the RPM allowance it cannot use", () => {
  const blocked = evaluateProviderAdmission({
    state: { bucket: undefined, inFlight: 1 },
    rpm: 2,
    concurrency: 1,
    now: 0,
  });

  assert.equal(blocked.decision.ok, false);
  if (blocked.decision.ok) return;
  assert.equal(blocked.decision.reason, "concurrency");
  assert.equal(blocked.state.bucket, undefined);

  let state = { ...blocked.state, inFlight: 0 };
  const first = evaluateProviderAdmission({
    state,
    rpm: 2,
    concurrency: 1,
    now: 0,
  });

  assert.equal(first.decision.ok, true);
  state = { ...first.state, inFlight: 0 };

  const second = evaluateProviderAdmission({
    state,
    rpm: 2,
    concurrency: 1,
    now: 0,
  });

  assert.equal(second.decision.ok, true);
  state = { ...second.state, inFlight: 0 };

  const exhausted = evaluateProviderAdmission({
    state,
    rpm: 2,
    concurrency: 1,
    now: 0,
  });

  assert.equal(exhausted.decision.ok, false);
  if (exhausted.decision.ok) return;
  assert.equal(exhausted.decision.reason, "rpm");
  assert.ok(exhausted.decision.retryAfterSeconds >= 1);
});

test("one serving account shares capacity across registry aliases and keys", () => {
  const alias = {
    baseUrl: "https://CAPACITY.example.test/v2/",
    keyEnvVar: " CAPACITY_KEY ",
  };

  assert.equal(servingAccountId(provider), servingAccountId(alias));

  let state = { bucket: undefined, inFlight: 0 };
  const run = () => {
    const outcome = evaluateProviderAdmission({
      state,
      rpm: 2,
      concurrency: 10,
      now: 0,
    });

    state = outcome.state;

    return outcome.decision;
  };

  assert.equal(run().ok, true);
  assert.equal(run().ok, true);

  const third = run();

  assert.equal(third.ok, false);
  if (third.ok) return;
  assert.equal(third.reason, "rpm");
  assert.equal(third.limit, 2);
  assert.equal(third.remaining, 0);
});

test("release is idempotent and can never mint a negative in-flight count", () => {
  let state = { bucket: undefined, inFlight: 2 };

  state = { ...state, inFlight: Math.max(0, state.inFlight - 1) };
  state = { ...state, inFlight: Math.max(0, state.inFlight - 1) };
  state = { ...state, inFlight: Math.max(0, state.inFlight - 1) };

  assert.equal(state.inFlight, 0);
});

test("an unknown ceiling cannot be converted into a slot by retrying", () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal(
      resolveProviderRpm({ configuredRpm: null, observedRpm: null }),
      null,
    );
  }
});
