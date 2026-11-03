import { spawnSync } from "node:child_process";
import { createServer } from "node:net";

import { Client } from "pg";

export const DISPOSABLE_POSTGRES_IMAGE = "postgres:17-alpine";
export const DISPOSABLE_POSTGRES_DATABASE = "gateway_concurrency";
export const DISPOSABLE_POSTGRES_USER = "gateway";
export const DISPOSABLE_POSTGRES_PASSWORD = "gateway_concurrency_probe";

export function redactPostgresUrl(value) {
  try {
    const url = new URL(value);

    url.username = url.username ? "***" : "";
    url.password = url.password ? "***" : "";

    return url.toString();
  } catch {
    return "invalid PostgreSQL URL";
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

export function dockerReady() {
  const result = run("docker", ["info", "--format", "{{.ServerVersion}}"]);

  return !result.error && result.status === 0 && Boolean(result.stdout.trim());
}

function startContainer(name, port) {
  const result = run("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "--env",
    `POSTGRES_USER=${DISPOSABLE_POSTGRES_USER}`,
    "--env",
    `POSTGRES_PASSWORD=${DISPOSABLE_POSTGRES_PASSWORD}`,
    "--env",
    `POSTGRES_DB=${DISPOSABLE_POSTGRES_DATABASE}`,
    "--publish",
    `127.0.0.1:${port}:5432`,
    DISPOSABLE_POSTGRES_IMAGE,
  ]);

  if (result.error) {
    throw new Error(`docker run failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(
      `docker run failed: ${(result.stderr || result.stdout).trim().slice(0, 500)}`,
    );
  }

  const container = result.stdout.trim();

  if (!container) {
    throw new Error("docker run returned no container id");
  }

  return container;
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

function stopContainer(name) {
  const stop = run("docker", ["stop", "--time", "1", name], {
    timeout: 15_000,
  });

  if (stop.error || stop.status !== 0) {
    run("docker", ["rm", "--force", name], { timeout: 15_000 });
  }
}

/**
 * Starts the same throwaway PostgreSQL contract the concurrency proof uses.
 * The caller owns the returned handle and must close it in a finally block.
 */
export async function startDisposablePostgres() {
  if (!dockerReady()) {
    throw new Error(
      "Docker is unavailable. Start Docker or set TEST_DATABASE_URL to a " +
        "disposable PostgreSQL endpoint.",
    );
  }

  const port = await reservePort();
  const name = `sg-pg-${process.pid}-${Date.now()}`;
  const connectionString =
    `postgres://${DISPOSABLE_POSTGRES_USER}:${DISPOSABLE_POSTGRES_PASSWORD}` +
    `@127.0.0.1:${port}/${DISPOSABLE_POSTGRES_DATABASE}`;
  const container = startContainer(name, port);

  try {
    await waitForDatabase(connectionString);
  } catch (error) {
    stopContainer(container);
    throw error;
  }

  return {
    connectionString,
    container,
    image: DISPOSABLE_POSTGRES_IMAGE,
    port,
    close() {
      stopContainer(container);
    },
  };
}
