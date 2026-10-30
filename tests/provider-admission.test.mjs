import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PROVIDER_CONCURRENCY,
  acquireProviderAdmission,
  providerAdmissionSnapshot,
  readProviderAdmissionConfig,
  resetProviderAdmission,
  resolveProviderRpm,
  servingAccountId,
} from "../lib/provider-admission.ts";

const provider = {
  baseUrl: "https://api.example.test/v1",
  keyEnvVar: "PROVIDER_KEY",
};

const config = { configuredRpm: null, concurrency: 4 };

test("registry aliases on one origin and credential share a serving account", () => {
  assert.equal(
    servingAccountId(provider),
    servingAccountId({
      baseUrl: "https://API.example.test/v2/",
      keyEnvVar: " PROVIDER_KEY ",
    }),
  );
  assert.notEqual(
    servingAccountId(provider),
    servingAccountId({ baseUrl: provider.baseUrl, keyEnvVar: "OTHER_KEY" }),
  );
  assert.notEqual(
    servingAccountId(provider),
    servingAccountId({ baseUrl: "https://api.other.test/v1", keyEnvVar: "PROVIDER_KEY" }),
  );
});

test("an unusable origin or credential name has no admission identity", () => {
  assert.equal(servingAccountId({ baseUrl: "not a url", keyEnvVar: "K" }), null);
  assert.equal(servingAccountId({ baseUrl: "ftp://api.example.test", keyEnvVar: "K" }), null);
  assert.equal(servingAccountId({ baseUrl: provider.baseUrl, keyEnvVar: "  " }), null);
});

test("a current upstream ceiling wins over the configured fallback", () => {
  assert.equal(
    resolveProviderRpm({ configuredRpm: 60, observedRpm: 15 }),
    15,
  );
  assert.equal(resolveProviderRpm({ configuredRpm: 60, observedRpm: null }), 60);
  assert.equal(resolveProviderRpm({ configuredRpm: null, observedRpm: null }), null);
  for (const invalid of [0, -1, 2.5, Number.NaN]) {
    assert.equal(
      resolveProviderRpm({ configuredRpm: invalid, observedRpm: invalid }),
      null,
      String(invalid),
    );
  }
});

test("admission configuration defaults and refuses malformed values", () => {
  assert.deepEqual(readProviderAdmissionConfig({}), {
    configuredRpm: null,
    concurrency: DEFAULT_PROVIDER_CONCURRENCY,
  });
  assert.deepEqual(
    readProviderAdmissionConfig({
      PROVIDER_SHARED_RPM: "30",
      PROVIDER_SHARED_CONCURRENCY: "2",
    }),
    { configuredRpm: 30, concurrency: 2 },
  );
  assert.deepEqual(
    readProviderAdmissionConfig({
      PROVIDER_SHARED_RPM: "0",
      PROVIDER_SHARED_CONCURRENCY: "0",
    }),
    { configuredRpm: null, concurrency: DEFAULT_PROVIDER_CONCURRENCY },
  );
});

test("one account ceiling binds every billing mode and key", () => {
  resetProviderAdmission();
  const tight = { configuredRpm: null, concurrency: 10 };

  const first = acquireProviderAdmission({
    provider,
    observedRpm: 2,
    config: tight,
    now: 0,
  });
  const second = acquireProviderAdmission({
    provider,
    observedRpm: 2,
    config: tight,
    now: 0,
  });
  const third = acquireProviderAdmission({
    // A second registry row on the same account cannot mint fresh capacity.
    provider: { baseUrl: "https://api.example.test/v2", keyEnvVar: "PROVIDER_KEY" },
    observedRpm: 2,
    config: tight,
    now: 0,
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(third.ok, false);

  if (third.ok) return;

  assert.equal(third.reason, "rpm");
  assert.equal(third.limit, 2);
  assert.equal(third.remaining, 0);
  assert.equal(third.retryAfterSeconds, 30);
});

test("concurrency is capped and released exactly once", () => {
  resetProviderAdmission();
  const one = { configuredRpm: null, concurrency: 1 };
  const first = acquireProviderAdmission({
    provider,
    observedRpm: 60,
    config: one,
    now: 0,
  });

  assert.equal(first.ok, true);
  if (!first.ok) return;

  const refused = acquireProviderAdmission({
    provider,
    observedRpm: 60,
    config: one,
    now: 0,
  });

  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.equal(refused.reason, "concurrency");
  assert.equal(refused.inFlight, 1);

  first.release();
  first.release();

  assert.equal(providerAdmissionSnapshot(first.accountId).inFlight, 0);

  const reacquired = acquireProviderAdmission({
    provider,
    observedRpm: 60,
    config: one,
    now: 0,
  });

  assert.equal(reacquired.ok, true);

  if (reacquired.ok) reacquired.release();
});

test("an unknown ceiling refuses before dispatch instead of assuming headroom", () => {
  resetProviderAdmission();

  for (const candidate of [
    { provider, observedRpm: null, config },
    { provider: { baseUrl: "", keyEnvVar: "K" }, observedRpm: 15, config },
  ]) {
    const outcome = acquireProviderAdmission({ ...candidate, now: 0 });

    assert.equal(outcome.ok, false);
    if (outcome.ok) continue;
    assert.ok(["unknown_ceiling", "unknown_identity"].includes(outcome.reason));
    assert.equal(outcome.limit, null);
    assert.equal(outcome.remaining, 0);
    assert.ok(outcome.retryAfterSeconds >= 1);
  }
});

test("a configured ceiling binds when upstream reports none", () => {
  resetProviderAdmission();
  const configured = { configuredRpm: 1, concurrency: 4 };
  const fallbackProvider = { ...provider, keyEnvVar: "FALLBACK_KEY" };

  assert.equal(
    acquireProviderAdmission({
      provider: fallbackProvider,
      observedRpm: null,
      config: configured,
      now: 0,
    }).ok,
    true,
  );
  assert.equal(
    acquireProviderAdmission({
      provider: fallbackProvider,
      observedRpm: null,
      config: configured,
      now: 0,
    }).ok,
    false,
  );
});

test("the snapshot reports real in-flight and token state", () => {
  resetProviderAdmission();
  const outcome = acquireProviderAdmission({ provider, observedRpm: 5, config, now: 0 });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  assert.deepEqual(providerAdmissionSnapshot(outcome.accountId), {
    inFlight: 1,
    remainingTokens: 4,
  });

  outcome.release();
  outcome.release();

  assert.deepEqual(providerAdmissionSnapshot(outcome.accountId), {
    inFlight: 0,
    remainingTokens: 4,
  });
});
