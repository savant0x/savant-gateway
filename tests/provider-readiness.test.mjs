import assert from "node:assert/strict";
import test from "node:test";

import {
  providerEnableRefusal,
  providerReadiness,
} from "../lib/providers/registry.ts";

const ENV = {
  PROVIDER_KEY: "sk-live-secret-value",
  OTHER_SECRET: "sk-unrelated-secret",
};

test("readiness separates enabled, disabled and blocked", () => {
  assert.deepEqual(
    providerReadiness({
      keyEnvVar: "PROVIDER_KEY",
      enabled: true,
      env: ENV,
    }),
    { state: "ready", configured: true, reason: null },
  );
  assert.equal(
    providerReadiness({
      keyEnvVar: "PROVIDER_KEY",
      enabled: false,
      env: ENV,
    }).state,
    "disabled",
  );

  const missing = providerReadiness({
    keyEnvVar: "COMMANDCODE_API_KEY",
    enabled: true,
    env: ENV,
  });

  assert.equal(missing.state, "blocked");
  assert.equal(missing.configured, false);
  assert.match(missing.reason, /COMMANDCODE_API_KEY is not set/);
  assert.equal(
    providerReadiness({
      keyEnvVar: "COMMANDCODE_API_KEY",
      enabled: false,
      env: ENV,
    }).state,
    "disabled",
    "a disabled provider is not claiming service",
  );
});

test("a whitespace-only value never counts as configured", () => {
  const readiness = providerReadiness({
    keyEnvVar: "PROVIDER_KEY",
    enabled: true,
    env: { PROVIDER_KEY: "   \n" },
  });

  assert.equal(readiness.state, "blocked");
  assert.equal(readiness.configured, false);
});

test("an empty key variable is blocked with a generic reason", () => {
  const readiness = providerReadiness({
    keyEnvVar: " ",
    enabled: true,
    env: ENV,
  });

  assert.equal(readiness.state, "blocked");
  assert.match(readiness.reason, /No key environment variable/);
});

test("the refusal only blocks a save that leaves the provider enabled", () => {
  assert.equal(
    providerEnableRefusal({
      label: "Savant",
      keyEnvVar: "PROVIDER_KEY",
      enabled: true,
      env: ENV,
    }),
    null,
  );
  assert.equal(
    providerEnableRefusal({
      label: "CommandCode",
      keyEnvVar: "COMMANDCODE_API_KEY",
      enabled: false,
      env: ENV,
    }),
    null,
  );

  const refusal = providerEnableRefusal({
    label: "CommandCode",
    keyEnvVar: "COMMANDCODE_API_KEY",
    enabled: true,
    env: ENV,
  });

  assert.match(refusal, /Cannot enable CommandCode/);
  assert.match(refusal, /COMMANDCODE_API_KEY/);
  assert.match(refusal, /redeploy/);
  assert.match(refusal, /keep the provider disabled/);
});

test("the refusal names the variable but never a value", () => {
  const refusal = providerEnableRefusal({
    label: "CommandCode",
    keyEnvVar: "COMMANDCODE_API_KEY",
    enabled: true,
    env: ENV,
  });

  assert.equal(refusal.includes(ENV.PROVIDER_KEY), false);
  assert.equal(refusal.includes(ENV.OTHER_SECRET), false);
});
