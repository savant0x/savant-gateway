#!/usr/bin/env node
/**
 * Online SQLite backup for the persistent volume.
 *
 * Copying only `gateway.db` while the process is writing is not a restore
 * point: the committed state of a WAL-mode database spans the main file and the
 * `-wal` sibling. SQLite's online backup API produces a single consistent file
 * from a live database, which is what this uses. The copy is then verified with
 * `integrity_check`, a required-table check and a SHA-256 checksum recorded in a
 * sidecar. A truncated or wrong copy fails here rather than during a restore.
 *
 * The sidecar is part of the backup, not decoration: `db-restore.mjs` refuses a
 * `.db` without one unless the operator explicitly accepts an unverified file.
 *
 * Usage:
 *   DB_PATH=/data/gateway.db node scripts/db-backup.mjs
 *   BACKUP_DIR=/data/backups BACKUP_RETENTION=14 node scripts/db-backup.mjs
 *
 * The copy lands on the same volume. Pulling it off the volume is a separate
 * operator step; this script does not claim off-site retention.
 */
import { createHash } from "node:crypto";
import { createReadStream, chmodSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import Database from "better-sqlite3";

const PREFIX = "gateway-";
const SUFFIX = ".db";
const META_SUFFIX = ".json";
const FORMAT = "savant-backup/1";
const SIBLINGS = ["-wal", "-shm"];
const REQUIRED_TABLES = [
  "users",
  "api_keys",
  "credit_ledger",
  "credit_holds",
  "topups",
  "usage_events",
  "settlements",
  "quarantined_holds",
  "billing_events",
];

function fail(message) {
  console.error(`db-backup: ${message}`);
  process.exit(1);
}

function restrict(path, mode) {
  try {
    chmodSync(path, mode);
  } catch {
    // Windows does not implement POSIX modes; the file still inherits the
    // OS ACL. The permission intent is documented in the runbook.
  }
}

async function sha256File(path) {
  const hash = createHash("sha256");

  for await (const chunk of createReadStream(path)) hash.update(chunk);

  return hash.digest("hex");
}

const configured = process.env.DB_PATH?.trim();

if (!configured) {
  fail("DB_PATH is required and must name the live database file");
}

const sourcePath = resolve(/* turbopackIgnore: true */ configured);

if (configured === ":memory:" || !sourcePath.endsWith(".db")) {
  fail(`DB_PATH must be a file path to a .db file, not ${JSON.stringify(configured)}`);
}

const targetDirectory = resolve(
  process.env.BACKUP_DIR?.trim() || join(dirname(sourcePath), "backups"),
);

const retention = Number(process.env.BACKUP_RETENTION ?? "7");

if (!Number.isInteger(retention) || retention < 1) {
  fail("BACKUP_RETENTION must be a positive integer");
}

mkdirSync(targetDirectory, { recursive: true });
restrict(targetDirectory, 0o700);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = join(targetDirectory, `${PREFIX}${stamp}${SUFFIX}`);
const metadataPath = `${destination}${META_SUFFIX}`;

if (resolve(destination).startsWith(`${targetDirectory}${sep}`) === false) {
  fail("refusing a destination outside BACKUP_DIR");
}

/**
 * Remove a database file together with the WAL siblings SQLite creates beside
 * it. Opening a WAL-mode copy — even read-only, just to verify it — leaves a
 * `-shm` and `-wal` behind, and deleting only the `.db` would accumulate those
 * orphans in the backup directory.
 */
function removeDatabaseFiles(path) {
  rmSync(path, { force: true });

  for (const suffix of SIBLINGS) {
    rmSync(`${path}${suffix}`, { force: true });
  }
}

function removeBackup(path) {
  removeDatabaseFiles(path);
  rmSync(`${path}${META_SUFFIX}`, { force: true });
  rmSync(`${path}${META_SUFFIX}.tmp`, { force: true });
}

/** Prune only files this script writes, oldest first, never the live file. */
function prune(keep) {
  const existing = readdirSync(targetDirectory)
    .filter((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))
    .map((name) => {
      const path = join(targetDirectory, name);

      return { path, modified: statSync(path).mtimeMs };
    })
    .sort((left, right) => right.modified - left.modified);

  const removed = [];

  for (const entry of existing.slice(keep)) {
    if (resolve(entry.path) === sourcePath) continue;

    removeBackup(entry.path);
    removed.push(entry.path);
  }

  return removed;
}

function writeMetadata(metadata) {
  const temporary = `${metadataPath}.tmp`;

  writeFileSync(temporary, `${JSON.stringify(metadata, null, 2)}\n`, {
    mode: 0o600,
  });
  restrict(temporary, 0o600);
  renameSync(temporary, metadataPath);
}

const source = new Database(sourcePath, { fileMustExist: true });

let pages = 0;

try {
  source.pragma("busy_timeout = 5000");
  pages = source.pragma("page_count", { simple: true });

  await source.backup(destination);
} finally {
  source.close();
}

const copy = new Database(destination, { readonly: true, fileMustExist: true });

let integrity;
let tableNames;
let pageSize;
let journalMode;
let userVersion;

try {
  integrity = copy.pragma("integrity_check", { simple: true });
  tableNames = copy
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
  pageSize = copy.pragma("page_size", { simple: true });
  journalMode = copy.pragma("journal_mode", { simple: true });
  userVersion = copy.pragma("user_version", { simple: true });
} finally {
  copy.close();

  // The verified copy is self-contained; the siblings only exist because the
  // verification opened it.
  for (const suffix of SIBLINGS) {
    rmSync(`${destination}${suffix}`, { force: true });
  }
}

if (integrity !== "ok") {
  removeBackup(destination);
  fail(`integrity_check on the copy reported ${JSON.stringify(integrity)}`);
}

const missing = REQUIRED_TABLES.filter((table) => !tableNames.includes(table));

if (missing.length > 0) {
  removeBackup(destination);
  fail(`the copy is missing required tables: ${missing.join(", ")}`);
}

if (tableNames.length < 1) {
  removeBackup(destination);
  fail("the copy contains no tables, so it is not a usable restore point");
}

let sha256;
let bytes;

try {
  bytes = statSync(destination).size;
  sha256 = await sha256File(destination);

  writeMetadata({
    format: FORMAT,
    file: destination.split(sep).pop(),
    created_at: new Date().toISOString(),
    sha256,
    bytes,
    pages,
    page_size: pageSize,
    journal_mode: journalMode,
    user_version: userVersion,
    tables: tableNames,
    integrity: "ok",
    retention,
  });
  restrict(metadataPath, 0o600);
} catch (error) {
  removeBackup(destination);

  fail(
    `could not finalize the backup: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

restrict(destination, 0o600);

const removed = prune(retention);

console.log(
  `db-backup: wrote ${destination} (${tableNames.length} tables, ${bytes} bytes, ` +
    `${pages} pages, sha256 ${sha256.slice(0, 16)}…, integrity ok)`,
);
console.log(`db-backup: metadata ${metadataPath}`);

for (const path of removed) {
  console.log(`db-backup: pruned ${path}`);
}
