import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { Client } from "pg";

/**
 * Disposable PostgreSQL without a container runtime (FID-2026-1105-002).
 *
 * The pinned `@embedded-postgres` platform packages ship the PostgreSQL 17
 * binaries. This module owns their lifecycle directly: one freshly initialized
 * cluster per run, bound to loopback on an ephemeral port, with a random
 * per-run password and a run-owned directory under ignored `.scratch/postgres`.
 * Nothing outside that directory is read destructively or deleted.
 */

export const DISPOSABLE_POSTGRES_VERSION = "17.11.0-beta.19";
export const DISPOSABLE_POSTGRES_DATABASE = "gateway_concurrency";
export const DISPOSABLE_POSTGRES_USER = "gateway";

export const DISPOSABLE_POSTGRES_SCRATCH_ROOT = join(
  process.cwd(),
  ".scratch",
  "postgres",
);

export const OWNERSHIP_MARKER = ".savant-pg-owner.json";

const SUPPORTED_PLATFORMS = {
  "win32-x64": "@embedded-postgres/windows-x64",
  "linux-x64": "@embedded-postgres/linux-x64",
};

const MARKER_MESSAGE =
  "refusing to delete a directory that is not owned by this run";

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

export function postgresPackage({
  platform = process.platform,
  arch = process.arch,
} = {}) {
  const name = SUPPORTED_PLATFORMS[`${platform}-${arch}`];

  if (!name) {
    throw new Error(
      `no pinned native PostgreSQL ${DISPOSABLE_POSTGRES_VERSION} distribution ` +
        `for ${platform}/${arch}; supported: ${Object.keys(SUPPORTED_PLATFORMS).join(", ")}. ` +
        "Set TEST_DATABASE_URL to a disposable PostgreSQL endpoint, or run " +
        "`npm run verify:supabase` on a managed server.",
    );
  }

  return { name, version: DISPOSABLE_POSTGRES_VERSION };
}

/**
 * npm's install-script policy can block the package's symlink hydration. The
 * symlink map ships inside the package, so the project can restore what the
 * binaries need without depending on a postinstall hook. Windows publishes an
 * empty map.
 */
function hydrateNativeSymlinks(packageRoot) {
  const mapFile = join(packageRoot, "native", "pg-symlinks.json");

  if (!existsSync(mapFile)) return;

  let links;

  try {
    links = JSON.parse(readFileSync(mapFile, "utf8"));
  } catch {
    return;
  }

  if (!Array.isArray(links)) return;

  for (const entry of links) {
    if (
      !entry ||
      typeof entry.source !== "string" ||
      typeof entry.target !== "string"
    ) {
      continue;
    }

    const source = resolve(packageRoot, entry.source);
    const target = resolve(packageRoot, entry.target);

    if (!isWithin(packageRoot, source) || !isWithin(packageRoot, target)) {
      continue;
    }

    if (existsSync(target)) continue;

    try {
      mkdirSync(dirname(target), { recursive: true });
      symlinkSync(relative(dirname(target), source), target);
    } catch {
      // A pre-existing link or a platform without symlink permission is not a
      // failure here; the binary check below is the authority.
    }
  }
}

export function resolvePostgresBinaries() {
  const { name, version } = postgresPackage();
  const require = createRequire(import.meta.url);
  let entry;

  try {
    entry = require.resolve(name);
  } catch {
    throw new Error(
      `the pinned native PostgreSQL package ${name} is not installed; run ` +
        "`npm install` (it is an optionalDependency so an incompatible " +
        "platform is skipped rather than failing the install).",
    );
  }

  const packageRoot = dirname(dirname(entry));

  hydrateNativeSymlinks(packageRoot);

  const binDirectory = join(packageRoot, "native", "bin");
  const executable = (tool) =>
    join(binDirectory, process.platform === "win32" ? `${tool}.exe` : tool);

  for (const tool of ["initdb", "pg_ctl"]) {
    if (!existsSync(executable(tool))) {
      throw new Error(
        `${name} is missing native/bin/${tool}; reinstall it with ` +
          "`npm install --force @embedded-postgres/" +
          (process.platform === "win32" ? "windows-x64" : "linux-x64") +
          "@" +
          version +
          "`.",
      );
    }
  }

  return {
    version,
    packageName: name,
    binDirectory,
    initdb: executable("initdb"),
    pgCtl: executable("pg_ctl"),
  };
}

function isWithin(root, candidate) {
  const path = relative(root, candidate);

  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

function samePath(left, right) {
  const normalize = (value) => {
    const text = resolve(value).replaceAll("\\", "/");

    return process.platform === "win32" ? text.toLowerCase() : text;
  };

  return normalize(left) === normalize(right);
}

export function ensureScratchRoot(
  scratchRoot = DISPOSABLE_POSTGRES_SCRATCH_ROOT,
) {
  mkdirSync(scratchRoot, { recursive: true, mode: 0o700 });

  if (lstatSync(scratchRoot).isSymbolicLink()) {
    throw new Error(
      `disposable PostgreSQL scratch root ${scratchRoot} is a symlink; use a real directory inside the repository`,
    );
  }

  return realpathSync(scratchRoot);
}

export function readOwnershipMarker(runDirectory) {
  const markerPath = join(runDirectory, OWNERSHIP_MARKER);
  let marker;

  try {
    marker = JSON.parse(readFileSync(markerPath, "utf8"));
  } catch {
    throw new Error(`${MARKER_MESSAGE}: ${markerPath} is missing or unreadable`);
  }

  if (
    !marker ||
    typeof marker.runId !== "string" ||
    !marker.runId ||
    typeof marker.pid !== "number"
  ) {
    throw new Error(`${MARKER_MESSAGE}: ${markerPath} is malformed`);
  }

  return marker;
}

/**
 * Deletes one run directory only after proving containment, non-symlink
 * identity and the marker written when the run was created.
 */
export function removeOwnedRunDirectory(runDirectory, { scratchRoot, runId }) {
  const root = realpathSync(scratchRoot);
  const absolute = resolve(runDirectory);

  if (!isWithin(root, absolute)) {
    throw new Error(
      `${MARKER_MESSAGE}: ${absolute} is outside ${root}`,
    );
  }

  if (lstatSync(absolute).isSymbolicLink()) {
    throw new Error(`${MARKER_MESSAGE}: ${absolute} is a symlink`);
  }

  const real = realpathSync(absolute);

  if (!isWithin(root, real)) {
    throw new Error(`${MARKER_MESSAGE}: ${real} escapes ${root}`);
  }

  const marker = readOwnershipMarker(real);

  if (marker.runId !== runId) {
    throw new Error(
      `${MARKER_MESSAGE}: marker names run ${marker.runId}, not ${runId}`,
    );
  }

  rmSync(real, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 });
}

function runBinary(
  binary,
  args,
  timeout = 120_000,
  stdio = ["ignore", "pipe", "pipe"],
) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    timeout,
    stdio,
    windowsHide: true,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();

  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    detail: result.error?.message ?? output.slice(-800),
    output,
  };
}

function readLogTail(logFile, limit = 800) {
  try {
    return readFileSync(logFile, "utf8").trim().slice(-limit) || "no server log";
  } catch {
    return "no server log";
  }
}

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();

    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not reserve a loopback port"));

        return;
      }

      const { port } = address;

      server.close((error) =>
        error ? reject(error) : resolvePort(port),
      );
    });
  });
}

async function waitForExpectedCluster(connectionString, dataDirectory) {
  const deadline = Date.now() + 60_000;
  let lastError = "not attempted";

  while (Date.now() < deadline) {
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 2_000,
      application_name: "savant-gateway-disposable-probe",
    });

    try {
      await client.connect();

      const result = await client.query(
        "SELECT current_setting('data_directory') AS data_directory",
      );
      const actual = result.rows[0]?.data_directory;

      if (typeof actual !== "string" || !samePath(actual, dataDirectory)) {
        throw new Error(
          "connected to a PostgreSQL cluster that is not the run-owned cluster",
        );
      }

      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);

      if (lastError.includes("not the run-owned cluster")) throw error;

      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  throw new Error(`database did not become ready: ${lastError}`);
}

function createRunDirectory(scratchRoot) {
  const runDirectory = mkdtempSync(join(scratchRoot, "run-"));
  const runId = randomUUID();
  const password = randomBytes(24).toString("base64url");

  writeFileSync(
    join(runDirectory, OWNERSHIP_MARKER),
    `${JSON.stringify(
      {
        runId,
        pid: process.pid,
        version: DISPOSABLE_POSTGRES_VERSION,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );

  const passwordFile = join(runDirectory, "pwfile");

  writeFileSync(passwordFile, `${password}\n`, { mode: 0o600 });
  chmodSync(passwordFile, 0o600);

  return {
    runDirectory,
    runId,
    password,
    passwordFile,
    dataDirectory: join(runDirectory, "data"),
    logFile: join(runDirectory, "postgres.log"),
  };
}

function stopServer(pgCtl, dataDirectory) {
  return runBinary(
    pgCtl,
    ["-D", dataDirectory, "-m", "fast", "-w", "-t", "30", "stop"],
    45_000,
    ["ignore", "ignore", "ignore"],
  );
}

/**
 * Starts an isolated PostgreSQL 17 cluster owned by this process.
 *
 * The caller must close the returned handle in a finally path. A hard process
 * kill can leave the cluster running; the run directory is printed so an
 * operator can stop it deliberately, and no other path is ever touched.
 */
export async function startDisposablePostgres(options = {}) {
  const binaries = resolvePostgresBinaries();
  const scratchRoot = ensureScratchRoot(options.scratchRoot);
  const run = createRunDirectory(scratchRoot);
  const port = options.port ?? (await reservePort());

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("disposable PostgreSQL port must be an integer 1-65535");
  }

  const connectionStringFor = (database) =>
    `postgres://${DISPOSABLE_POSTGRES_USER}:${encodeURIComponent(
      run.password,
    )}@127.0.0.1:${port}/${database}`;

  let started = false;

  try {
    const init = runBinary(binaries.initdb, [
      "-D",
      run.dataDirectory,
      "-U",
      DISPOSABLE_POSTGRES_USER,
      "--auth=scram-sha-256",
      "--pwfile",
      run.passwordFile,
      "--encoding=UTF8",
      "--no-locale",
    ]);

    if (!init.ok) {
      throw new Error(`initdb failed: ${init.detail}`);
    }

    rmSync(run.passwordFile, { force: true });

    // The detached postmaster inherits pg_ctl's handles on Windows, so a pipe
    // keeps spawnSync waiting until its timeout even after a healthy start.
    // The server log is the failure evidence instead.
    const start = runBinary(
      binaries.pgCtl,
      [
        "-D",
        run.dataDirectory,
        "-l",
        run.logFile,
        "-w",
        "-t",
        "60",
        "-o",
        `-p ${port} -h 127.0.0.1`,
        "start",
      ],
      120_000,
      ["ignore", "ignore", "ignore"],
    );

    if (!start.ok) {
      throw new Error(
        `pg_ctl start on 127.0.0.1:${port} failed: ${readLogTail(run.logFile)}`,
      );
    }

    started = true;

    await waitForExpectedCluster(
      connectionStringFor("postgres"),
      run.dataDirectory,
    );

    const admin = new Client({
      connectionString: connectionStringFor("postgres"),
      connectionTimeoutMillis: 5_000,
    });

    try {
      await admin.connect();
      await admin.query(`CREATE DATABASE "${DISPOSABLE_POSTGRES_DATABASE}"`);
    } finally {
      await admin.end().catch(() => undefined);
    }

    const connectionString = connectionStringFor(
      DISPOSABLE_POSTGRES_DATABASE,
    );
    let closed = false;

    return {
      connectionString,
      port,
      image: `PostgreSQL ${binaries.version} (native)`,
      dataDirectory: run.dataDirectory,
      runDirectory: run.runDirectory,
      runId: run.runId,
      close() {
        if (closed) return { ok: true };

        closed = true;

        const stop = stopServer(binaries.pgCtl, run.dataDirectory);

        if (!stop.ok) {
          return {
            ok: false,
            error:
              `pg_ctl stop failed: ${stop.detail}; the run directory ` +
              `${run.runDirectory} was retained`,
          };
        }

        try {
          removeOwnedRunDirectory(run.runDirectory, {
            scratchRoot,
            runId: run.runId,
          });

          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error:
              `${error instanceof Error ? error.message : String(error)}; ` +
              `the run directory ${run.runDirectory} was retained`,
          };
        }
      },
    };
  } catch (error) {
    if (started) stopServer(binaries.pgCtl, run.dataDirectory);

    let cleanup = "the run directory was removed";

    try {
      removeOwnedRunDirectory(run.runDirectory, {
        scratchRoot,
        runId: run.runId,
      });
    } catch (cleanupError) {
      cleanup =
        `the run directory ${run.runDirectory} was retained: ` +
        (cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError));
    }

    throw new Error(
      `${error instanceof Error ? error.message : String(error)} (${cleanup})`,
    );
  }
}

/**
 * Validates an explicitly supplied disposable endpoint before schema-resetting
 * work. The application URL is never an acceptable test target, and a remote
 * host requires a deliberate opt-in because the HTTP suites recreate schemas.
 */
export function assertDisposableEndpoint(connectionString, name, options = {}) {
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
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]";

  if (!loopback && options.allowRemote !== true) {
    throw new Error(
      `refusing non-loopback ${name} (${host}); set ` +
        "PUSH_POSTGRES_ALLOW_REMOTE=yes (or DISPOSABLE_REMOTE_HTTP=yes for " +
        "the HTTP suites) only for a disposable remote database",
    );
  }

  return url;
}
