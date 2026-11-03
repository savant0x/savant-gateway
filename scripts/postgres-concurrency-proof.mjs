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
import { createServer } from "node:net";

import { Client } from "pg";

const IMAGE = "postgres:17-alpine";
const DATABASE = "gateway_concurrency";
const USER = "gateway";
const PASSWORD = "gateway_concurrency_probe";
const TEST_FILE = "tests/settlement-concurrency.test.mjs";

function fail(message) {
  console.error(`postgres-concurrency: FAIL — ${message}`);
  process.exitCode = 1;
}

function redact(value) {
  try {
    const url = new URL(value);
    url.username = url.username ? "***" : "";
    url.password = url.password ? "***" : "";

    return url.toString();
  } catch {
    return "invalid TEST_DATABASE_URL";
  }
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not reserve a loopback port"));

        return;
      }

      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    timeout: 20_000,
    ...options,
  });
}

function dockerReady() {
  const result = run("docker", ["info", "--format", "{{.ServerVersion}}"]);

  return result.status === 0 && Boolean(result.stdout.trim());
}

function startContainer(name, port) {
  const result = run("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "--env",
    `POSTGRES_USER=${USER}`,
    "--env",
    `POSTGRES_PASSWORD=${PASSWORD}`,
    "--env",
    `POSTGRES_DB=${DATABASE}`,
    "--publish",
    `127.0.0.1:${port}:5432`,
    IMAGE,
  ]);

  if (result.status !== 0) {
    throw new Error(
      `docker run failed: ${(result.stderr || result.stdout).trim().slice(0, 500)}`,
    );
  }

  return result.stdout.trim();
}

async function waitForDatabase(connectionString) {
  const deadline = Date.now() + 60_000;
  let lastError = "not attempted";

  while (Date.now() < deadline) {
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 2_000,
    });

    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();

      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`database did not become ready: ${lastError}`);
}

function runProof(connectionString) {
  const result = spawnSync(
    process.execPath,
    ["--test", TEST_FILE],
    {
      stdio: "inherit",
      env: { ...process.env, TEST_DATABASE_URL: connectionString },
    },
  );

  if (result.status !== 0) {
    throw new Error(`concurrency proof failed with exit ${result.status ?? "signal"}`);
  }
}

let container = null;

try {
  const supplied = process.env.TEST_DATABASE_URL?.trim();

  if (supplied) {
    if (/^(postgres|postgresql):\/\//.test(supplied) === false) {
      fail("TEST_DATABASE_URL must be a postgres:// or postgresql:// URL");
    } else {
      console.log(`postgres-concurrency: using ${redact(supplied)}`);
      runProof(supplied);
      console.log("postgres-concurrency: PASS — two connections cannot double-debit");
    }
  } else if (!dockerReady()) {
    fail(
      "Docker is unavailable and TEST_DATABASE_URL is unset. This financial " +
        "proof cannot be skipped; start Docker or point TEST_DATABASE_URL at a " +
        "disposable PostgreSQL database.",
    );
  } else {
    const port = await reservePort();
    const name = `sg-pg-concurrency-${process.pid}-${Date.now()}`;
    const connectionString = `postgres://${USER}:${PASSWORD}@127.0.0.1:${port}/${DATABASE}`;

    console.log(`postgres-concurrency: starting disposable ${IMAGE} on port ${port}`);
    container = startContainer(name, port);
    await waitForDatabase(connectionString);
    runProof(connectionString);
    console.log("postgres-concurrency: PASS — two connections cannot double-debit");
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  if (container) {
    const stop = run("docker", ["stop", "--time", "1", container], {
      timeout: 15_000,
    });

    if (stop.status !== 0) {
      run("docker", ["rm", "--force", container], { timeout: 15_000 });
    }
  }
}
