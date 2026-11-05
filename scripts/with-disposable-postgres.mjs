#!/usr/bin/env node
/**
 * Runs a command with a disposable PostgreSQL endpoint (FID-145,
 * FID-2026-1105-002).
 *
 * `npm run push:postgres` starts one throwaway native PostgreSQL 17 cluster,
 * exports `TEST_DATABASE_URL` and `HTTP_TEST_DATABASE_URL` to `git push`, then
 * stops it and removes its run directory. The pre-push hook can therefore run
 * the mandatory two-connection proof and both HTTP suites without Docker or
 * manual setup.
 *
 * An existing `TEST_DATABASE_URL` is reused instead of starting a cluster. It
 * must be a loopback endpoint unless `PUSH_POSTGRES_ALLOW_REMOTE=yes` is set
 * deliberately; the HTTP suites reset schemas, so a production host is a
 * destructive destination, not a convenient one.
 */

import { spawnSync } from "node:child_process";

import {
  assertDisposableEndpoint,
  redactPostgresUrl,
  startDisposablePostgres,
} from "./disposable-postgres.mjs";

const USAGE = [
  "usage: npm run push:postgres [-- <git push arguments>]",
  "       node scripts/with-disposable-postgres.mjs -- <command> [arguments]",
].join("\n");

function fail(message) {
  console.error(`push-postgres: FAIL — ${message}`);
  process.exitCode = 1;
}

function parseCommand(args) {
  const separator = args.indexOf("--");

  if (separator === -1) {
    if (args.length) {
      throw new Error(`arguments must follow --\n${USAGE}`);
    }

    return ["git", "push"];
  }

  const command = args.slice(separator + 1);

  return command.length ? command : ["git", "push"];
}

let disposable = null;

try {
  const command = parseCommand(process.argv.slice(2));
  const supplied = process.env.TEST_DATABASE_URL?.trim();
  let connectionString;

  if (supplied) {
    assertDisposableEndpoint(supplied, "TEST_DATABASE_URL", {
      allowRemote: process.env.PUSH_POSTGRES_ALLOW_REMOTE === "yes",
    });
    connectionString = supplied;
    console.log(
      `push-postgres: using supplied TEST_DATABASE_URL ${redactPostgresUrl(supplied)}`,
    );
  } else {
    disposable = await startDisposablePostgres();
    connectionString = disposable.connectionString;
    console.log(
      `push-postgres: starting disposable ${disposable.image} on port ${disposable.port}`,
    );
  }

  const env = { ...process.env, TEST_DATABASE_URL: connectionString };

  if (!env.HTTP_TEST_DATABASE_URL?.trim()) {
    env.HTTP_TEST_DATABASE_URL = connectionString;
  } else {
    assertDisposableEndpoint(
      env.HTTP_TEST_DATABASE_URL.trim(),
      "HTTP_TEST_DATABASE_URL",
      { allowRemote: env.PUSH_POSTGRES_ALLOW_REMOTE === "yes" },
    );
  }

  if (env.PUSH_POSTGRES_ALLOW_REMOTE === "yes") {
    env.DISPOSABLE_REMOTE_HTTP = "yes";
  }

  console.log(`push-postgres: TEST_DATABASE_URL=${redactPostgresUrl(connectionString)}`);
  console.log(`push-postgres: running ${command.join(" ")}`);

  const result = spawnSync(command[0], command.slice(1), {
    stdio: "inherit",
    env,
  });

  if (result.error) {
    throw new Error(`could not run ${command[0]}: ${result.error.message}`);
  }

  if (result.status === null) {
    throw new Error(`${command[0]} terminated by ${result.signal ?? "a signal"}`);
  }

  if (result.status !== 0) {
    console.error(`push-postgres: command exited ${result.status}`);
    process.exitCode = result.status;
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  const cleanup = disposable?.close();

  if (cleanup && !cleanup.ok) {
    console.error(`push-postgres: cleanup FAIL — ${cleanup.error}`);
    process.exitCode = 1;
  }
}
