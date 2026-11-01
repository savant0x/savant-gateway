import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { readinessReport, validateProductionConfig } from "../lib/production-config.ts";

const ORIGIN = "https://gateway.example";
const DATABASE_URL = "postgres://gateway:secret@db.example.com:5432/gateway";
const ADMIN_ENV = {
  ADMIN_PASSWORD: "production-admin-password",
  ADMIN_SESSION_SECRET: "production-admin-session-secret-0123456789",
};

function production(extra = {}) {
  return {
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: ORIGIN,
    DATABASE_URL,
    ...ADMIN_ENV,
    ...extra,
  };
}

test("non-production environments are not held to the durable contract", () => {
  const result = validateProductionConfig({});

  assert.equal(result.ok, true);
  assert.equal(result.issues.length, 0);
  assert.equal(result.origin, null);
  assert.equal(result.databaseUrl, null);
  assert.equal(result.disposable, false);
});

test("a valid production configuration validates with a normalised origin and absolute database", () => {
  const result = validateProductionConfig(production());

  assert.equal(result.ok, true);
  assert.equal(result.issues.length, 0);
  assert.equal(result.origin, ORIGIN);
  assert.equal(result.databaseUrl, "postgres://db.example.com:5432/gateway");
  assert.equal(result.disposable, false);
});

test("a localhost origin is rejected in production", () => {
  for (const origin of ["http://localhost:3000", "https://127.0.0.1", "https://[::1]", "https://0.0.0.0"]) {
    const result = validateProductionConfig(production({ NEXT_PUBLIC_SITE_URL: origin }));

    assert.equal(result.ok, false, origin);
    assert.ok(
      result.issues.some((entry) =>
        entry.code === "origin_loopback" || entry.code === "origin_insecure",
      ),
      origin,
    );
  }

  // Plain values are never echoed into the diagnostics.
  const invalid = validateProductionConfig(
    production({ NEXT_PUBLIC_SITE_URL: "https://user:leaked-password@example.com/v1" }),
  );

  assert.equal(invalid.issues[0].code, "origin_invalid");
  assert.equal(invalid.issues[0].message.includes("leaked-password"), false);

  const missing = validateProductionConfig(
    production({ NEXT_PUBLIC_SITE_URL: undefined }),
  );

  assert.equal(missing.issues.some((entry) => entry.code === "origin_missing"), true);
});

test("a database that cannot keep balances is rejected in production", () => {
  const missing = validateProductionConfig(
    production({ DATABASE_URL: undefined }),
  );

  assert.equal(missing.issues.some((entry) => entry.code === "db_missing"), true);

  const memory = validateProductionConfig(
    production({ DATABASE_URL: ":memory:" }),
  );

  assert.equal(memory.issues.some((entry) => entry.code === "db_memory"), true);

  const relative = validateProductionConfig(
    production({ DATABASE_URL: "./data/gateway.db" }),
  );

  assert.equal(relative.issues.some((entry) => entry.code === "db_relative"), true);

  const invalid = validateProductionConfig(
    production({ DATABASE_URL: "mysql://db.example.com/gateway" }),
  );

  assert.equal(invalid.issues.some((entry) => entry.code === "db_invalid"), true);

  const ephemeral = validateProductionConfig(
    production({ DATABASE_URL: "postgres://postgres@127.0.0.1:5432/gateway" }),
  );

  assert.equal(ephemeral.issues.some((entry) => entry.code === "db_ephemeral"), true);
});

test("the admin console requires its configured credentials in production", () => {
  const unconfigured = validateProductionConfig({
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: ORIGIN,
    DATABASE_URL,
  });

  assert.equal(
    unconfigured.issues.some((entry) => entry.code === "admin_unconfigured"),
    true,
  );
});

test("a second application process multiplies admission and is rejected", () => {
  for (const extra of [
    { WEB_CONCURRENCY: "2" },
    { PM2_INSTANCES: "4" },
    { NODE_APP_INSTANCE: "1" },
  ]) {
    const result = validateProductionConfig(production(extra));

    assert.equal(result.issues.length, 1, JSON.stringify(extra));
    assert.equal(result.issues[0].code, "multi_worker", JSON.stringify(extra));
  }
});

test("a manual signal handler forfeits the drain contract and is rejected", () => {
  for (const value of ["1", "true", "yes", "on"]) {
    const result = validateProductionConfig(
      production({ NEXT_MANUAL_SIG_HANDLE: value }),
    );

    assert.equal(result.issues.length, 1, value);
    assert.equal(result.issues[0].code, "manual_signal_handler", value);
  }

  const tolerated = validateProductionConfig(
    production({ NEXT_MANUAL_SIG_HANDLE: "0" }),
  );

  assert.equal(tolerated.ok, true);
});

test("a disposable start must be an exact, deliberate opt-in", () => {
  const weak = validateProductionConfig(production({ GATEWAY_DISPOSABLE_START: "1" }));

  assert.equal(weak.disposable, false);

  const opted = validateProductionConfig({
    NODE_ENV: "production",
    GATEWAY_DISPOSABLE_START: "yes",
    DATABASE_URL: "postgres://postgres@127.0.0.1:5432/postgres",
  });

  assert.equal(opted.disposable, true);
  // Origin checks are skipped in disposable mode, but the operator-console
  // check is not silently dropped.
  assert.equal(
    opted.issues.some((entry) => entry.code === "admin_unconfigured"),
    true,
  );

  const usable = validateProductionConfig({
    NODE_ENV: "production",
    GATEWAY_DISPOSABLE_START: "yes",
    DATABASE_URL: "postgres://postgres@127.0.0.1:5432/postgres",
    ...ADMIN_ENV,
  });

  assert.equal(usable.ok, true);
  assert.equal(usable.issues.length, 0);
});

test("readiness reports every dead combination truthfully", () => {
  const configuration = validateProductionConfig(production());

  assert.deepEqual(readinessReport({ configuration, storage: true }), {
    status: "ready",
    httpStatus: 200,
    checks: { configuration: "ok", storage: "ok" },
  });

  assert.deepEqual(readinessReport({ configuration, storage: false }), {
    status: "not_ready",
    httpStatus: 503,
    checks: { configuration: "ok", storage: "unavailable" },
  });

  const broken = validateProductionConfig(
    production({ DATABASE_URL: ":memory:" }),
  );

  assert.deepEqual(readinessReport({ configuration: broken, storage: true }), {
    status: "not_ready",
    httpStatus: 503,
    checks: { configuration: "invalid", storage: "ok" },
  });

  const disposableConfig = validateProductionConfig({
    NODE_ENV: "production",
    GATEWAY_DISPOSABLE_START: "yes",
    DATABASE_URL: "postgres://postgres@127.0.0.1:5432/postgres",
    ...ADMIN_ENV,
  });

  assert.deepEqual(readinessReport({ configuration: disposableConfig, storage: true }), {
    status: "ready",
    httpStatus: 200,
    checks: { configuration: "disposable", storage: "ok" },
  });
});

test("the operator gate fails with codes and never with secret values", () => {
  const valueful = production({ NEXT_PUBLIC_SITE_URL: "https://user:leaked-password@example.com/v1" });

  delete valueful.ADMIN_PASSWORD;

  const failed = spawnSync(
    process.execPath,
    ["scripts/production-config-check.mjs"],
    { encoding: "utf8", env: valueful, timeout: 60_000 },
  );

  assert.equal(failed.status, 1);
  assert.ok(
    failed.stderr.includes("origin_invalid") ||
      failed.stderr.includes("admin_unconfigured"),
  );
  assert.equal(failed.stderr.includes("leaked-password"), false);
});

test("the operator gate passes both a durable and an explicit disposable runtime", () => {
  const durable = spawnSync(
    process.execPath,
    ["scripts/production-config-check.mjs"],
    { encoding: "utf8", env: production(), timeout: 60_000 },
  );

  assert.equal(durable.status, 0, durable.stderr);
  assert.ok(durable.stdout.includes("config-check: PASS"));

  const disposable = spawnSync(
    process.execPath,
    ["scripts/production-config-check.mjs"],
    {
      encoding: "utf8",
      env: {
        NODE_ENV: "production",
        GATEWAY_DISPOSABLE_START: "yes",
        DATABASE_URL: "postgres://postgres@127.0.0.1:5432/postgres",
        ...ADMIN_ENV,
      },
      timeout: 60_000,
    },
  );

  assert.equal(disposable.status, 0, disposable.stderr);
  assert.ok(disposable.stdout.includes("disposable"));
});
