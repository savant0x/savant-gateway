import assert from "node:assert/strict";
import test from "node:test";

import {
  acquireProviderAdmission,
  providerAdmissionSnapshot,
  resetProviderAdmission,
  servingAccountId,
} from "../lib/provider-admission.ts";

const provider = {
  baseUrl: "https://capacity.example.test/v1",
  keyEnvVar: "CAPACITY_KEY",
};

function releaseAll(leases) {
  for (const lease of leases) lease.release();
  leases.clear();
}

test("interleaved admission never exceeds the serving concurrency", () => {
  resetProviderAdmission();
  const config = { configuredRpm: null, concurrency: 3 };
  const accountId = servingAccountId(provider);
  const leases = new Set();
  let admitted = 0;
  let concurrencyRefusals = 0;

  for (let index = 0; index < config.concurrency; index += 1) {
    const outcome = acquireProviderAdmission({
      provider,
      observedRpm: 100_000,
      config,
      now: 0,
    });

    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      admitted += 1;
      leases.add(outcome);
    }
  }

  const saturated = acquireProviderAdmission({
    provider,
    observedRpm: 100_000,
    config,
    now: 0,
  });

  assert.equal(saturated.ok, false);
  if (!saturated.ok) {
    assert.equal(saturated.reason, "concurrency");
    concurrencyRefusals += 1;
  }

  for (let step = 0; step < 500; step += 1) {
    if (leases.size > 0 && step % 3 === 0) {
      const [lease] = leases;
      lease.release();
      leases.delete(lease);
    } else if (leases.size < config.concurrency) {
      const outcome = acquireProviderAdmission({
        provider,
        observedRpm: 100_000,
        config,
        now: 0,
      });

      assert.equal(outcome.ok, true);
      if (outcome.ok) {
        admitted += 1;
        leases.add(outcome);
      }
    } else if (step % 4 === 0) {
      const refused = acquireProviderAdmission({
        provider,
        observedRpm: 100_000,
        config,
        now: 0,
      });

      assert.equal(refused.ok, false);
      if (!refused.ok) {
        assert.equal(refused.reason, "concurrency");
        concurrencyRefusals += 1;
      }
    }

    assert.ok(
      providerAdmissionSnapshot(accountId).inFlight <= config.concurrency,
    );
  }

  releaseAll(leases);

  assert.ok(admitted > 0);
  assert.ok(concurrencyRefusals > 0);
  assert.equal(providerAdmissionSnapshot(accountId).inFlight, 0);
});

test("a concurrency refusal does not spend the RPM allowance it cannot use", () => {
  resetProviderAdmission();
  const config = { configuredRpm: null, concurrency: 1 };
  const first = acquireProviderAdmission({
    provider,
    observedRpm: 2,
    config,
    now: 0,
  });

  assert.equal(first.ok, true);
  if (!first.ok) return;

  const concurrencyRefused = acquireProviderAdmission({
    provider,
    observedRpm: 2,
    config,
    now: 0,
  });

  assert.equal(concurrencyRefused.ok, false);
  if (concurrencyRefused.ok) return;
  assert.equal(concurrencyRefused.reason, "concurrency");
  assert.equal(concurrencyRefused.remaining, 0);

  first.release();

  const stillHasOneToken = acquireProviderAdmission({
    provider,
    observedRpm: 2,
    config,
    now: 0,
  });

  assert.equal(stillHasOneToken.ok, true);
  if (!stillHasOneToken.ok) return;
  stillHasOneToken.release();

  const exhausted = acquireProviderAdmission({
    provider,
    observedRpm: 2,
    config,
    now: 0,
  });

  assert.equal(exhausted.ok, false);
  if (exhausted.ok) return;
  assert.equal(exhausted.reason, "rpm");
  assert.ok(exhausted.retryAfterSeconds >= 1);
});

test("one serving account shares capacity across registry aliases and keys", () => {
  resetProviderAdmission();
  const config = { configuredRpm: null, concurrency: 10 };
  const alias = {
    baseUrl: "https://CAPACITY.example.test/v2/",
    keyEnvVar: " CAPACITY_KEY ",
  };
  const a = acquireProviderAdmission({
    provider,
    observedRpm: 2,
    config,
    now: 0,
  });
  const b = acquireProviderAdmission({
    provider: alias,
    observedRpm: 2,
    config,
    now: 0,
  });
  const c = acquireProviderAdmission({
    provider,
    observedRpm: 2,
    config,
    now: 0,
  });

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(c.ok, false);
  if (c.ok) return;
  assert.equal(c.reason, "rpm");
  assert.equal(c.limit, 2);
  assert.equal(c.remaining, 0);

  if (a.ok) a.release();
  if (b.ok) b.release();
  assert.equal(providerAdmissionSnapshot("x").inFlight, 0);
});

test("release is idempotent and can never mint a negative in-flight count", () => {
  resetProviderAdmission();
  const config = { configuredRpm: null, concurrency: 2 };
  const first = acquireProviderAdmission({
    provider,
    observedRpm: 100,
    config,
    now: 0,
  });
  const second = acquireProviderAdmission({
    provider,
    observedRpm: 100,
    config,
    now: 0,
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;

  first.release();
  first.release();
  first.release();

  assert.equal(providerAdmissionSnapshot(first.accountId).inFlight, 1);

  second.release();
  second.release();

  assert.equal(providerAdmissionSnapshot(second.accountId).inFlight, 0);
});

test("an unknown ceiling cannot be converted into a slot by retrying", () => {
  resetProviderAdmission();
  const config = { configuredRpm: null, concurrency: 4 };

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const outcome = acquireProviderAdmission({
      provider,
      observedRpm: null,
      config,
      now: 0,
    });

    assert.equal(outcome.ok, false);
    if (outcome.ok) continue;
    assert.equal(outcome.reason, "unknown_ceiling");
    assert.equal(outcome.limit, null);
    assert.equal(outcome.remaining, 0);
    assert.equal(outcome.retryAfterSeconds, 5);
  }

  assert.equal(providerAdmissionSnapshot("x").inFlight, 0);
});
