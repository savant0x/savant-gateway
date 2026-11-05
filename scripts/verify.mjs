#!/usr/bin/env node
/**
 * Sequential verification runner with a machine-readable receipt
 * (FID-2026-1103-136).
 *
 * The raw output of every gate is written to `.verify/<gate>.log` and echoed so
 * diagnosis does not change. The JSON summary is written only after all gates
 * have run. Exit status is the fail-closed aggregate: a signal, a missing gate,
 * a non-zero exit or an unexpected skip fails the run even if other gates
 * passed.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertDisposableEndpoint,
  redactPostgresUrl,
  startDisposablePostgres,
} from "./disposable-postgres.mjs";
import {
  formatSummary,
  gateResult,
  summarizeRun,
  VERIFY_GATES,
} from "./verify-summary.mjs";

const ROOT = process.cwd();
const LOGS_DIR = join(ROOT, ".verify");
const SUMMARY_FILE = join(LOGS_DIR, "summary.json");
const SUMMARY_PATH = ".verify/summary.json";
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

const gateEnv = { ...process.env };

function isLoopbackEndpoint(connectionString) {
  try {
    const host = new URL(connectionString).hostname.toLowerCase();

    return (
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "::1" ||
      host === "[::1]"
    );
  } catch {
    return false;
  }
}

/**
 * One real PostgreSQL endpoint for the whole sequential run (FID-2026-1105-002).
 * A supplied URL is validated and reused; otherwise this process owns a native
 * cluster and passes its URL to the unit, concurrency and HTTP gates. The URL
 * never reaches a log unredacted.
 */
async function prepareDatabase() {
  const suppliedTest = gateEnv.TEST_DATABASE_URL?.trim();
  const suppliedHttp = gateEnv.HTTP_TEST_DATABASE_URL?.trim();
  const allowRemote = process.env.PUSH_POSTGRES_ALLOW_REMOTE === "yes";

  if (suppliedTest) {
    assertDisposableEndpoint(suppliedTest, "TEST_DATABASE_URL", {
      allowRemote,
    });
    console.log(
      `verify: using supplied TEST_DATABASE_URL ${redactPostgresUrl(suppliedTest)}`,
    );
  }

  if (suppliedHttp) {
    assertDisposableEndpoint(suppliedHttp, "HTTP_TEST_DATABASE_URL", {
      allowRemote: process.env.DISPOSABLE_REMOTE_HTTP === "yes",
    });
  } else if (suppliedTest) {
    gateEnv.HTTP_TEST_DATABASE_URL = suppliedTest;
  }

  if (suppliedTest) {
    if (!isLoopbackEndpoint(gateEnv.HTTP_TEST_DATABASE_URL)) {
      gateEnv.DISPOSABLE_REMOTE_HTTP = "yes";
    }

    return null;
  }

  const disposable = await startDisposablePostgres();

  gateEnv.TEST_DATABASE_URL = disposable.connectionString;
  gateEnv.HTTP_TEST_DATABASE_URL = disposable.connectionString;
  console.log(
    `verify: disposable ${disposable.image} on 127.0.0.1:${disposable.port} ` +
      `(run directory ${disposable.runDirectory})`,
  );

  return disposable;
}

function runGate(gate) {
  const startedAt = Date.now();
  const command = `${NPM} run ${gate.script}`;
  const result = spawnSync(NPM, ["run", gate.script], {
    cwd: ROOT,
    encoding: "utf8",
    env: gateEnv,
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const finishedAt = Date.now();
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const log = `.verify/${gate.name}.log`;

  writeFileSync(join(LOGS_DIR, `${gate.name}.log`), output);

  console.log(output.trimEnd());

  return gateResult({
    name: gate.name,
    command,
    exitCode: result.status,
    signal: result.signal ?? null,
    startedAt,
    finishedAt,
    output,
    allowSkips: gate.allowSkips,
    expectsTests: gate.expectsTests,
    log,
  });
}

async function main() {
  rmSync(LOGS_DIR, { force: true, recursive: true });
  mkdirSync(LOGS_DIR, { recursive: true });

  let disposable = null;

  try {
    disposable = await prepareDatabase();
  } catch (error) {
    console.error(
      `verify: FAIL — ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;

    return;
  }

  try {
    const startedAt = Date.now();
    const gates = [];

    for (const gate of VERIFY_GATES) {
      console.log(`\nverify >>> ${gate.name} (${NPM} run ${gate.script})`);
      const result = runGate(gate);

      gates.push(result);

      // A failed gate still lets later independent gates run, so one receipt
      // names every failure instead of only the first. The run remains failed.
      if (result.status !== "pass") {
        console.log(`verify: ${gate.name} -> ${result.status}`);
      }
    }

    const summary = summarizeRun({
      gates,
      startedAt,
      finishedAt: Date.now(),
      logsDir: SUMMARY_PATH,
    });

    writeFileSync(SUMMARY_FILE, `${JSON.stringify(summary, null, 2)}\n`);

    console.log(formatSummary(summary));
    process.exitCode = summary.status === "pass" ? 0 : 1;
  } finally {
    const cleanup = disposable?.close();

    if (cleanup && !cleanup.ok) {
      console.error(`verify: cleanup FAIL — ${cleanup.error}`);
      process.exitCode = 1;
    }
  }
}

await main();
