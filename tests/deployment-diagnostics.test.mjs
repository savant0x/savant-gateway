import assert from "node:assert/strict";
import test from "node:test";

import { readDeploymentDiagnostics } from "../lib/deployment-diagnostics.ts";

const PROVIDERS = [
  {
    slug: "savant",
    label: "Savant",
    keyEnvVar: "PROVIDER_KEY",
    enabled: true,
  },
  {
    slug: "commandcode",
    label: "CommandCode",
    keyEnvVar: "COMMANDCODE_API_KEY",
    enabled: false,
  },
];

test("runtime commit, branch and repository are reported without secrets", () => {
  const data = readDeploymentDiagnostics(
    {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_REPO_OWNER: "spenc",
      VERCEL_GIT_REPO_SLUG: "gateway",
      NEXT_PUBLIC_SITE_URL: "https://gateway.example.com/admin",
      PROVIDER_KEY: "sk_live_secret_value",
      COMMANDCODE_API_KEY: "  ",
    },
    PROVIDERS,
    new Date("2026-11-03T12:00:00.000Z"),
  );

  assert.equal(data.production, true);
  assert.equal(data.vercelEnv, "production");
  assert.equal(data.commitShort, "aaaaaaa");
  assert.equal(data.branch, "main");
  assert.equal(data.repository, "spenc/gateway");
  assert.equal(data.siteOrigin, "https://gateway.example.com");
  assert.deepEqual(data.missingKeys, ["COMMANDCODE_API_KEY"]);
  assert.equal(data.providerKeys[0].configured, true);
  assert.equal(data.generatedAt, "2026-11-03T12:00:00.000Z");

  const serialized = JSON.stringify(data);

  assert.equal(serialized.includes("sk_live_secret_value"), false);
  assert.equal(serialized.includes('PROVIDER_KEY"'), true);
});

test("a malformed commit or origin is absent, not guessed", () => {
  const data = readDeploymentDiagnostics(
    {
      NODE_ENV: "development",
      VERCEL_GIT_COMMIT_SHA: "not-a-sha",
      NEXT_PUBLIC_SITE_URL: "not a url",
    },
    [],
  );

  assert.equal(data.commit, null);
  assert.equal(data.commitShort, null);
  assert.equal(data.branch, null);
  assert.equal(data.repository, null);
  assert.equal(data.siteOrigin, null);
  assert.equal(data.production, false);
});
