#!/usr/bin/env node
/**
 * Disposable PostgreSQL concurrency gate (FID-2026-1103-126).
 *
 * `tests/settlement-concurrency.test.mjs` proves that two real connections
 * cannot debit one balance twice. PGlite has one connection, so the ordinary
 * unit suite can only skip that proof. Skipping is allowed there; it is not
 * allowed here. This gate either runs against an explicitly disposable
 * PostgreSQL URL or starts a throwaway container, and it fails closed when
 * neither is available.
 *
 * Only disposable credentials are permitted. `TEST_DATABASE_URL` is deliberately
 * separate from `DATABASE_URL`, so a shell that points the application at a
 * real database cannot silently turn this proof into a production write.
 */

import { spawnSync } from "node:child_process";

import {
  redactPostgresUrl,
  startDisposablePostgres,
} from "./disposable-postgres.mjs";

const TEST_FILES = [
  "tests/settlement-concurrency.test.mjs",
  "tests/admission-concurrency.test.mjs",
  "tests/content-job-concurrency.test.mjs",
  "tests/content-link-concurrency.test.mjs",
];

function fail(message) {
  console.error(`postgres-concurrency: FAIL — ${message}`);
  process.exitCode = 1;
}

function runProof(connectionString) {
  for (const file of TEST_FILES) {
    const result = spawnSync(
      process.execPath,
      ["--test", file],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          TEST_DATABASE_URL: connectionString,
          CONTENT_CONCURRENCY_REQUIRED: "1",
        },
      },
    );

    if (result.status !== 0) {
      throw new Error(
        `${file} failed with exit ${result.status ?? "signal"}`,
      );
    }
  }
}

let disposable = null;

try {
  const supplied = process.env.TEST_DATABASE_URL?.trim();

  if (supplied) {
    if (/^(postgres|postgresql):\/\//.test(supplied) === false) {
      fail("TEST_DATABASE_URL must be a postgres:// or postgresql:// URL");
    } else {
      console.log(`postgres-concurrency: using ${redactPostgresUrl(supplied)}`);
      runProof(supplied);
      console.log(
        "postgres-concurrency: PASS — no double-debit and no doubled admission",
      );
    }
  } else {
    disposable = await startDisposablePostgres();
    console.log(
      `postgres-concurrency: starting disposable ${disposable.image} on port ${disposable.port}`,
    );
    runProof(disposable.connectionString);
    console.log(
      "postgres-concurrency: PASS — no double-debit and no doubled admission",
    );
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  disposable?.close();
}
