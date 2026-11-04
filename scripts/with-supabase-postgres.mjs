#!/usr/bin/env node
/**
 * Runs a command with a disposable database on an existing PostgreSQL server
 * (FID-2026-1103-159).
 *
 * `npm run push:supabase` and `npm run verify:supabase` create a uniquely named
 * `gateway_<purpose>_<timestamp>_<pid>` database on the server named by
 * `DATABASE_URL` (falling back to `DB_CONNECTION_STRING`), export both test
 * variables to the child, then drop only that database. This is the Docker-free
 * path for a managed server such as Supabase.
 *
 * Safety boundary:
 * - the base database is never used as the test endpoint; the child URL differs
 *   by database name only;
 * - the script creates and drops only its generated name, never another schema;
 * - cleanup runs after the child exits, including a non-zero exit, and reports
 *   an interrupted cleanup rather than claiming success;
 * - host and database name are printed; credentials are redacted by the shared
 *   helper and never printed by this script.
 *
 * A hard process kill can leave the generated database behind. The final line
 * names the database so an operator can drop it; nothing else is affected.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "pg";

import { redactPostgresUrl } from "./disposable-postgres.mjs";

const PREFIX = "supabase-postgres";
const GENERATED_NAME = /^gateway_(push|verify|run)_\d+_\d+$/;

const USAGE = `usage: npm run push:supabase [-- <git push arguments>]
       npm run verify:supabase
       node scripts/with-supabase-postgres.mjs -- <command> [arguments]

Creates a generated gateway_* database on the server named by DATABASE_URL
(fallback: DB_CONNECTION_STRING), runs the command with TEST_DATABASE_URL and
HTTP_TEST_DATABASE_URL pointing at it, then drops it. Never prints a credential.`;

function fail(message) {
  console.error(`${PREFIX}: FAIL — ${message}`);
  process.exitCode = 1;
}

/**
 * Reads `.env.local` without mutating the process environment. Only the two
 * connection-string names are consulted; provider and admin secrets must not
 * leak into the child gate processes, where their presence changes behavior.
 */
function readLocalEnv() {
  const file = resolve(process.cwd(), ".env.local");
  const values = {};

  if (!existsSync(file)) return values;

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());

    if (!match) continue;

    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[match[1]] = value;
  }

  return values;
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

function purposeFor(command) {
  if (command[0] === "git" && command.includes("push")) return "push";
  if (command.join(" ").includes("verify")) return "verify";

  return "run";
}

function parseConnectionString(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "DATABASE_URL/DB_CONNECTION_STRING is not a valid URL; use a postgres:// connection string",
    );
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(
      "DATABASE_URL/DB_CONNECTION_STRING must be a postgres:// or postgresql:// URL",
    );
  }

  if (!url.hostname) {
    throw new Error(
      "DATABASE_URL/DB_CONNECTION_STRING must name a PostgreSQL host",
    );
  }

  const database = url.pathname.replace(/^\//, "");

  if (GENERATED_NAME.test(database)) {
    throw new Error(
      `the configured URL already names the generated database ${database}; ` +
        "point it at the server's maintenance database instead",
    );
  }

  return url;
}

function sslConfig(url) {
  if (url.searchParams.get("sslmode") === "disable") return undefined;

  const host = url.hostname.toLowerCase();
  const loopback =
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]";

  // The managed provider presents a certificate this environment may not have
  // in its trust store. Test data only; verification is not a security boundary
  // here, and a loopback server is left on the driver default.
  return loopback ? undefined : { rejectUnauthorized: false };
}

function npmCommand(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function resolveCommand(command) {
  if (/^(npm|npx)$/.test(command[0])) return npmCommand(command[0]);

  return command[0];
}

async function probe(connectionString) {
  const client = new Client({
    connectionString,
    ssl: sslConfig(new URL(connectionString)),
    connectionTimeoutMillis: 15_000,
    application_name: "savant-gateway-disposable-probe",
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
  } finally {
    await client.end().catch(() => undefined);
  }
}

let admin = null;
let name = null;

try {
  const local = readLocalEnv();
  const args = process.argv.slice(2);
  const wantsHelp = args.includes("--help") || args.includes("-h");
  const command = wantsHelp ? null : parseCommand(args);

  if (command === null) {
    console.log(USAGE);
    process.exitCode = 0;
  } else {
    const raw = (
      process.env.DATABASE_URL?.trim() ||
      local.DATABASE_URL?.trim() ||
      process.env.DB_CONNECTION_STRING?.trim() ||
      local.DB_CONNECTION_STRING?.trim() ||
      ""
    ).trim();

    if (!raw) {
      throw new Error(
        "DATABASE_URL (or DB_CONNECTION_STRING) is required: it names the server that will own the disposable database",
      );
    }

    const baseUrl = parseConnectionString(raw);
    const purpose = purposeFor(command);

    name = `gateway_${purpose}_${Date.now()}_${process.pid}`;

    admin = new Client({
      connectionString: raw,
      ssl: sslConfig(baseUrl),
      connectionTimeoutMillis: 15_000,
      application_name: "savant-gateway-disposable-admin",
    });

    await admin.connect();

    try {
      await admin.query(`CREATE DATABASE "${name}"`);
    } catch (error) {
      throw new Error(
        `could not create ${name} on ${baseUrl.hostname}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const testUrl = new URL(raw);

    testUrl.pathname = `/${name}`;

    const connectionString = testUrl.toString();

    console.log(
      `${PREFIX}: created ${name} on ${baseUrl.hostname} (${redactPostgresUrl(connectionString)})`,
    );

    await probe(connectionString).catch((error) => {
      throw new Error(
        `the generated database did not accept a connection: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    });

    console.log(`${PREFIX}: running ${command.join(" ")}`);

    const result = spawnSync(resolveCommand(command), command.slice(1), {
      stdio: "inherit",
      env: {
        ...process.env,
        TEST_DATABASE_URL: connectionString,
        HTTP_TEST_DATABASE_URL: connectionString,
      },
      shell: process.platform === "win32" && /^(npm|npx)$/.test(command[0]),
    });

    if (result.error) {
      throw new Error(
        `could not run ${command[0]}: ${result.error.message}`,
      );
    }

    if (result.status === null) {
      throw new Error(
        `${command[0]} terminated by ${result.signal ?? "a signal"}`,
      );
    }

    if (result.status !== 0) {
      console.error(`${PREFIX}: command exited ${result.status}`);
      process.exitCode = result.status;
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  if (admin && name) {
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      console.log(`${PREFIX}: dropped ${name}`);
    } catch (error) {
      console.error(
        `${PREFIX}: cleanup FAIL — drop ${name} manually: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );

      if (!process.exitCode) process.exitCode = 1;
    } finally {
      await admin.end().catch(() => undefined);
    }
  }
}
