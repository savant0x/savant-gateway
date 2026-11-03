#!/usr/bin/env node
/**
 * Runs a command with a disposable PostgreSQL endpoint (FID-145).
 *
 * `npm run push:postgres` starts a throwaway `postgres:17-alpine` container,
 * exports `TEST_DATABASE_URL` and `HTTP_TEST_DATABASE_URL` to `git push`, then
 * stops the container. The pre-push hook can therefore run the mandatory
 * two-connection proof and both HTTP suites without manual setup.
 *
 * An existing `TEST_DATABASE_URL` is reused instead of starting a container.
 * It must be a loopback endpoint unless `PUSH_POSTGRES_ALLOW_REMOTE=yes` is
 * set deliberately; the HTTP suites reset schemas, so a production host is a
 * destructive destination, not a convenient one.
 */

import { spawnSync } from "node:child_process";

import {
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

function validateEndpoint(connectionString, name) {
  let url;

  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${name} must be a postgres:// or postgresql:// URL`);
  }

  const application = process.env.DATABASE_URL?.trim();

  if (application && application === connectionString) {
    throw new Error(
      `${name} must not equal DATABASE_URL; the HTTP suites reset schemas`,
    );
  }

  const host = url.hostname.toLowerCase();
  const loopback =
    host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";

  if (!loopback && process.env.PUSH_POSTGRES_ALLOW_REMOTE !== "yes") {
    throw new Error(
      `refusing non-loopback ${name} (${host}); set ` +
        "PUSH_POSTGRES_ALLOW_REMOTE=yes only for a disposable remote database",
    );
  }
}

let disposable = null;

try {
  const command = parseCommand(process.argv.slice(2));
  const supplied = process.env.TEST_DATABASE_URL?.trim();
  let connectionString;

  if (supplied) {
    validateEndpoint(supplied, "TEST_DATABASE_URL");
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
    validateEndpoint(env.HTTP_TEST_DATABASE_URL.trim(), "HTTP_TEST_DATABASE_URL");
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
  disposable?.close();
}
