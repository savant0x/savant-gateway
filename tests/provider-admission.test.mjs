import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PROVIDER_CONCURRENCY,
  evaluateProviderAdmission,
  readProviderAdmissionConfig,
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
  assert.equal(third.retryAfterSeconds, 30);
});

test("concurrency is capped and a released slot is reusable", () => {
  const first = evaluateProviderAdmission({
    state: { bucket: undefined, inFlight: 0 },
    rpm: 60,
    concurrency: 1,
    now: 0,
  });

  assert.equal(first.decision.ok, true);
  assert.equal(first.state.inFlight, 1);

  const refused = evaluateProviderAdmission({
    state: first.state,
    rpm: 60,
    concurrency: 1,
    now: 0,
  });

  assert.equal(refused.decision.ok, false);
  if (refused.decision.ok) return;
  assert.equal(refused.decision.reason, "concurrency");
  assert.equal(refused.decision.inFlight, 1);
  assert.equal(refused.state.inFlight, 1);

  const reacquired = evaluateProviderAdmission({
    state: { ...refused.state, inFlight: 0 },
    rpm: 60,
    concurrency: 1,
    now: 0,
  });

  assert.equal(reacquired.decision.ok, true);
});

test("an unknown ceiling refuses before dispatch instead of assuming headroom", () => {
  assert.equal(
    resolveProviderRpm({
      configuredRpm: readProviderAdmissionConfig({}).configuredRpm,
      observedRpm: null,
    }),
    null,
  );
});

test("a configured ceiling binds when upstream reports none", () => {
  const configured = { configuredRpm: 1, concurrency: 4 };
  let state = { bucket: undefined, inFlight: 0 };
  const run = () => {
    const outcome = evaluateProviderAdmission({
      state,
      rpm: 1,
      concurrency: configured.concurrency,
      now: 0,
    });

    state = outcome.state;

    return outcome.decision;
  };

  assert.equal(run().ok, true);
  assert.equal(run().ok, false);
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
  const run = () => {
    const outcome = evaluateProviderAdmission({
      state,
      rpm: 2,
      concurrency: 1,
      now: 0,
    });

    state = outcome.state;

    return outcome.decision;
  };

  assert.equal(run().ok, true);

  state = { ...state, inFlight: 0 };
  assert.equal(run().ok, true);

  state = { ...state, inFlight: 0 };

  const exhausted = run();

  assert.equal(exhausted.ok, false);
  if (exhausted.ok) return;
  assert.equal(exhausted.reason, "rpm");
  assert.ok(exhausted.retryAfterSeconds >= 1);
});
