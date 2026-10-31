#!/usr/bin/env node
/**
 * Online SQLite backup for the persistent volume.
 *
 * Copying only `gateway.db` while the process is writing is not a restore
 * point: the committed state of a WAL-mode database spans the main file and the
 * `-wal` sibling. SQLite's online backup API produces a single consistent file
 * from a live database, which is what this uses. The copy is then verified with
 * `integrity_check` and a table count, so a truncated backup fails here rather
 * than during a restore.
 *
 * Usage:
 *   DB_PATH=/data/gateway.db node scripts/db-backup.mjs
 *   BACKUP_DIR=/data/backups BACKUP_RETENTION=14 node scripts/db-backup.mjs
 *
 * The copy lands on the same volume. Pulling it off the volume is a separate
 * operator step (`fly sftp get`); this script does not claim off-site retention.
 */
import { mkdirSync, readdirSync, statSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import Database from "better-sqlite3";

const PREFIX = "gateway-";
const SUFFIX = ".db";

function fail(message) {
  console.error(`db-backup: ${message}`);
  process.exit(1);
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

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = join(targetDirectory, `${PREFIX}${stamp}${SUFFIX}`);

const SIBLINGS = ["-wal", "-shm"];

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

/** Prune only files this script writes, oldest first. */
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
    removeDatabaseFiles(entry.path);
    removed.push(entry.path);
  }

  return removed;
}

const source = new Database(sourcePath, { fileMustExist: true });

let written = 0;

try {
  const before = source.pragma("page_count", { simple: true });

  await source.backup(destination);

  written = before;
} finally {
  source.close();
}

const copy = new Database(destination, { readonly: true, fileMustExist: true });

let integrity;
let tables;

try {
  integrity = copy.pragma("integrity_check", { simple: true });
  tables = copy
    .prepare("SELECT count(*) AS total FROM sqlite_master WHERE type = 'table'")
    .get().total;
} finally {
  copy.close();
}

if (integrity !== "ok") {
  removeDatabaseFiles(destination);
  fail(`integrity_check on the copy reported ${JSON.stringify(integrity)}`);
}

if (!Number.isFinite(tables) || tables < 1) {
  removeDatabaseFiles(destination);
  fail("the copy contains no tables, so it is not a usable restore point");
}

if (resolve(destination).startsWith(`${resolve(targetDirectory)}${sep}`) === false) {
  fail("refusing to report a destination outside BACKUP_DIR");
}

// The verified copy is self-contained; the siblings only exist because the
// verification opened it.
for (const suffix of SIBLINGS) {
  rmSync(`${destination}${suffix}`, { force: true });
}

const removed = prune(retention);
const size = statSync(destination).size;

console.log(
  `db-backup: wrote ${destination} (${tables} tables, ${size} bytes, ` +
    `${written} pages, integrity ok)`,
);

for (const path of removed) {
  console.log(`db-backup: pruned ${path}`);
}
