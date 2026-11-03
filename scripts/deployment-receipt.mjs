#!/usr/bin/env node
/**
 * Redacted deployment receipt (FID-2026-1103-141).
 *
 * Records what can be observed from this checkout: the remote commit, branch,
 * working-tree cleanliness and whether each provider key name is present in the
 * current process environment. It never reads, prints or hashes a value.
 *
 * This is not Vercel evidence by itself. The admin Diagnostics page reports the
 * same fields from the running deployment; comparing the two is what proves the
 * hosted runtime, not a local shell.
 *
 *   node scripts/deployment-receipt.mjs --json
 *   node scripts/deployment-receipt.mjs --env=PROVIDER_KEY,COMMANDCODE_API_KEY
 */

import { spawnSync } from "node:child_process";

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });

  return result.status === 0 ? result.stdout.trim() : null;
}

function readEnvNames() {
  const argument = process.argv.find((value) => value.startsWith("--env="));
  const names = argument
    ? argument.slice("--env=".length).split(",")
    : ["PROVIDER_KEY", "COMMANDCODE_API_KEY"];

  return Array.from(
    new Set(
      names
        .map((name) => name.trim())
        .filter((name) => /^[A-Z][A-Z0-9_]{1,63}$/.test(name)),
    ),
  );
}

const commit = git(["rev-parse", "HEAD"]);
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
const remote = git(["remote", "get-url", "origin"]);
const status = git(["status", "--porcelain"]);
const envNames = readEnvNames();
const receipt = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  git: {
    commit,
    commitShort: commit ? commit.slice(0, 7) : null,
    branch,
    remote,
    clean: status === "" ? true : status === null ? null : false,
  },
  runtime: {
    nodeEnv: process.env.NODE_ENV?.trim() || null,
    vercel: process.env.VERCEL === "1",
    vercelEnv: process.env.VERCEL_ENV?.trim() || null,
    siteOrigin: process.env.NEXT_PUBLIC_SITE_URL?.trim() || null,
  },
  providerKeys: Object.fromEntries(
    envNames.map((name) => [name, Boolean(process.env[name]?.trim())]),
  ),
  limitations: [
    "Key presence is the current process environment, not a Vercel deployment.",
    "This script never reads or prints a secret value.",
    "Use Admin -> Diagnostics on the deployed URL for hosted evidence.",
  ],
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(receipt, null, 2));
} else {
  console.log(`Deployment receipt (${receipt.generatedAt})`);
  console.log(`  commit     ${receipt.git.commitShort ?? "unknown"}`);
  console.log(`  branch     ${receipt.git.branch ?? "unknown"}`);
  console.log(`  clean      ${receipt.git.clean ?? "unknown"}`);
  console.log(`  remote     ${receipt.git.remote ?? "unknown"}`);
  for (const [name, present] of Object.entries(receipt.providerKeys)) {
    console.log(`  ${name.padEnd(24)} ${present ? "present" : "missing"}`);
  }
  console.log("  Values are never read or printed.");
}
