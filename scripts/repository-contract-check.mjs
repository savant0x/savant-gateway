#!/usr/bin/env node
/**
 * Repository contract check (FID-2026-1104-008).
 *
 * The check proves the parts that can drift without a compiler: one Node
 * runtime, one verification gate contract, active FID registration, promised
 * test paths, archived closure commits, root-document links and current-doc
 * indexing. It reads files and git metadata only. A passing link check is not a
 * prose review; current claims still need human judgement.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { checkFidRegister } from "./fid-register.mjs";
import { VERIFY_GATES } from "./verify-summary.mjs";

const ROOT = process.cwd();
const errors = [];

function fail(message) {
  errors.push(message);
}

function read(relative) {
  try {
    return readFileSync(join(ROOT, relative), "utf8");
  } catch {
    fail(`${relative}: missing or unreadable`);

    return "";
  }
}

const NATIVE_POSTGRES = {
  "@embedded-postgres/windows-x64": "17.11.0-beta.19",
  "@embedded-postgres/linux-x64": "17.11.0-beta.19",
};

const REMOVED_CONTAINER_FILES = [
  "Dockerfile",
  ".dockerignore",
  "fly.toml",
  "scripts/docker-entrypoint.sh",
];

function runtimeContract() {
  const pkg = JSON.parse(read("package.json") || "{}");
  const ci = read(".github/workflows/ci.yml");
  const nvmrc = read(".nvmrc").trim();

  if (pkg.engines?.node !== "24.x") {
    fail(`package.json engines.node is ${pkg.engines?.node ?? "missing"}; expected 24.x`);
  }
  if (!/node-version:\s*24\b/.test(ci)) {
    fail(".github/workflows/ci.yml does not pin node-version: 24");
  }
  if (nvmrc !== "24") fail(`.nvmrc is ${nvmrc || "missing"}; expected 24`);

  const optional = pkg.optionalDependencies ?? {};

  for (const [name, version] of Object.entries(NATIVE_POSTGRES)) {
    if (optional[name] !== version) {
      fail(
        `package.json optionalDependencies.${name} is ${optional[name] ?? "missing"}; expected ${version}`,
      );
    }
  }

  for (const removed of REMOVED_CONTAINER_FILES) {
    if (existsSync(join(ROOT, removed))) {
      fail(
        `${removed}: container packaging must not return; delivery is Vercel with PostgreSQL`,
      );
    }
  }

  if (/^\s*services:/m.test(ci) || /postgres:17-alpine/.test(ci)) {
    fail(".github/workflows/ci.yml still declares a container service");
  }

  const disposable = read("scripts/disposable-postgres.mjs");

  if (!/initdb/.test(disposable) || !/native\/bin/.test(disposable)) {
    fail("scripts/disposable-postgres.mjs does not own a native initdb lifecycle");
  }
  if (/["']docker["']/i.test(disposable)) {
    fail("scripts/disposable-postgres.mjs still invokes docker");
  }
}

function gateContract() {
  const verify = read("scripts/verify.mjs");
  const prepush = read(".githooks/pre-push");
  const ci = read(".github/workflows/ci.yml");
  const required = ["repository:check", "storage:check", "deployment:receipt"];

  for (const name of required) {
    if (!VERIFY_GATES.some((gate) => gate.name === name)) {
      fail(`VERIFY_GATES is missing ${name}`);
    }
  }
  if (!/VERIFY_GATES/.test(verify)) {
    fail("scripts/verify.mjs does not consume VERIFY_GATES");
  }
  if (!/npm run verify\b/.test(prepush)) {
    fail(".githooks/pre-push does not run npm run verify");
  }
  if (!/npm run verify\b/.test(ci)) {
    fail(".github/workflows/ci.yml does not run npm run verify");
  }
}

function rootDocumentLinks() {
  const documents = [
    "README.md",
    "SCOPE.md",
    "CHANGELOG.md",
    "knowledge.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "docs/README.md",
  ];
  const link = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  for (const document of documents) {
    const text = read(document);

    for (const match of text.matchAll(link)) {
      const target = match[1];

      if (/^(?:https?:|mailto:|#|\/)/i.test(target)) continue;

      const path = decodeURIComponent(target.split("#")[0].split("?")[0]);

      if (!path) continue;

      const absolute = resolve(ROOT, dirname(document), path);

      if (!existsSync(absolute)) {
        fail(`${document}: link target does not resolve: ${target}`);
      }
    }
  }
}

function indexAndClaims() {
  const index = read("docs/README.md");
  const docs = readdirSync(join(ROOT, "docs"))
    .filter((file) => file.endsWith(".md") && file !== "README.md");

  for (const file of docs) {
    if (!index.includes(`(${file})`)) {
      fail(`docs/README.md does not index docs/${file}`);
    }
  }

  const knowledge = read("knowledge.md");
  const operator = read("docs/operator-first-run.md");
  const troubleshooting = read("docs/troubleshooting.md");

  for (const stale of [
    /usage in SQLite/i,
    /SQLite is local state/i,
    /through a second `better-sqlite3` connection/i,
  ]) {
    if (stale.test(knowledge)) fail(`knowledge.md: stale current claim ${stale}`);
  }
  if (/SQLite writer/.test(operator)) {
    fail("docs/operator-first-run.md: stale SQLite writer claim");
  }
  if (!/superseded 2026-11-02/i.test(troubleshooting)) {
    fail("docs/troubleshooting.md: historical SQLite/Fly sections lack a dated banner");
  }
  if (!/superseded/i.test(read("docs/deployment-runbook.md"))) {
    fail("docs/deployment-runbook.md: historical record lacks a dated banner");
  }
}

runtimeContract();
gateContract();
const { active, errors: fidErrors } = checkFidRegister(ROOT);
for (const error of fidErrors) fail(error);
rootDocumentLinks();
indexAndClaims();

if (errors.length > 0) {
  console.error("repository-check: FAIL");

  for (const error of errors) console.error(`  - ${error}`);

  process.exitCode = 1;
} else {
  console.log(
    `repository-check: PASS (Node 24, ${VERIFY_GATES.length} gates, ${active} active FIDs, root links and current docs consistent)`,
  );
}
