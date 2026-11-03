import assert from "node:assert/strict";
import test from "node:test";

import { readAdminDiagnostics } from "../lib/admin-diagnostics.ts";

const PASSWORD = "correct horse battery";
const SECRET = "s".repeat(48);

test("missing credentials are reported without a value", () => {
  const data = readAdminDiagnostics({ NODE_ENV: "production" });

  assert.equal(data.configured, false);
  assert.equal(data.password, "missing");
  assert.equal(data.sessionSecret, "missing");
  assert.equal(data.origin, null);
  assert.equal(data.originValid, false);
  assert.equal(data.productionConfigValid, false);
  assert.ok(data.issueCodes.includes("admin_unconfigured"));
  assert.ok(data.issueCodes.includes("origin_missing"));
});

test("short values report a band, never the value or its exact length", () => {
  const data = readAdminDiagnostics({
    NODE_ENV: "production",
    ADMIN_PASSWORD: "weak-secret",
    ADMIN_SESSION_SECRET: "also-weak-secret",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  });

  assert.equal(data.password, "too_short");
  assert.equal(data.sessionSecret, "too_short");
  assert.equal(data.configured, false);
  assert.equal(data.origin, "http://localhost:3000");
  assert.equal(data.originValid, false);
  assert.ok(data.issueCodes.includes("origin_insecure"));
  assert.ok(data.issueCodes.includes("origin_loopback"));
  assert.equal(JSON.stringify(data).includes("weak-secret"), false);
});

test("valid production credentials and origin are reported as state only", () => {
  const data = readAdminDiagnostics({
    NODE_ENV: "production",
    ADMIN_PASSWORD: PASSWORD,
    ADMIN_SESSION_SECRET: SECRET,
    NEXT_PUBLIC_SITE_URL: "https://gateway.example.com",
    DATABASE_URL: "postgres://gateway:secret@db.example.com:5432/gateway",
  });
  const serialized = JSON.stringify(data);

  assert.equal(data.configured, true);
  assert.equal(data.password, "valid");
  assert.equal(data.sessionSecret, "valid");
  assert.equal(data.origin, "https://gateway.example.com");
  assert.equal(data.originValid, true);
  assert.equal(data.productionConfigValid, true);
  assert.equal(serialized.includes(PASSWORD), false);
  assert.equal(serialized.includes(SECRET), false);
  assert.equal(serialized.includes("48"), false);
});

test("an origin with credentials is normalized before display", () => {
  const data = readAdminDiagnostics({
    NODE_ENV: "development",
    ADMIN_PASSWORD: PASSWORD,
    ADMIN_SESSION_SECRET: SECRET,
    NEXT_PUBLIC_SITE_URL: "https://user:pass@gateway.example.com/admin",
  });

  assert.equal(data.origin, "https://gateway.example.com");
  assert.equal(data.originValid, false);
  assert.equal(JSON.stringify(data).includes("user:pass"), false);
  assert.equal(data.productionConfigValid, null);
});

test("quoted or whitespace values are reported, not trimmed into validity", () => {
  const data = readAdminDiagnostics({
    ADMIN_PASSWORD: `"${PASSWORD}"`,
    ADMIN_SESSION_SECRET: ` ${SECRET} `,
  });

  assert.equal(data.password, "valid");
  assert.equal(data.sessionSecret, "valid");
  assert.equal(data.passwordWhitespace, false);
  assert.equal(data.sessionSecretWhitespace, true);
  assert.equal(JSON.stringify(data).includes(PASSWORD), false);
  assert.equal(JSON.stringify(data).includes(SECRET), false);
});

test("surrounding whitespace is flagged without claiming a shorter value", () => {
  const data = readAdminDiagnostics({
    ADMIN_PASSWORD: ` ${PASSWORD}\n`,
    ADMIN_SESSION_SECRET: SECRET,
  });

  assert.equal(data.password, "valid");
  assert.equal(data.passwordWhitespace, true);
  assert.equal(data.sessionSecretWhitespace, false);
  assert.equal(data.configured, true);
  assert.equal(JSON.stringify(data).includes(PASSWORD), false);
});

test("database reachability is reported only when probed", () => {
  const env = {
    ADMIN_PASSWORD: PASSWORD,
    ADMIN_SESSION_SECRET: SECRET,
  };

  assert.equal(readAdminDiagnostics(env).databaseReachable, null);
  assert.equal(
    readAdminDiagnostics(env, { databaseReachable: true }).databaseReachable,
    true,
  );
  assert.equal(
    readAdminDiagnostics(env, { databaseReachable: false }).databaseReachable,
    false,
  );
});
