#!/usr/bin/env node
/**
 * Logical backup for the PostgreSQL handle (FID-2026-1031-086, step 6).
 *
 * The SQLite version copied one file. There is no file now: the database is
 * PostgreSQL, reached through `DATABASE_URL` in a deployment or PGlite in local
 * development, so the backup is a logical snapshot — `manifest.json` with row
 * counts and per-table checksums, and one `.jsonl` per table.
 *
 * Two properties make the result usable rather than merely present:
 *
 * 1. **The dump verifies itself.** Every table's checksum is order-independent,
 *    so a restore can prove it loaded the same rows, not just the same counts.
 * 2. **An unbalanced ledger cannot be backed up.** The dump refuses to be
 *    written when a user's balance is not the sum of their ledger rows, because
 *    such a copy would be restored as though it were the truth.
 *
 * Usage:
 *   node scripts/db-backup.mjs
 *   BACKUP_DIR=/data/backups BACKUP_RETENTION=14 node scripts/db-backup.mjs
 *
 * `DATABASE_URL` selects the server; without it, `PG_LOCAL_PATH` or `data/pg`.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { BackupRefused, dumpDatabase } from "../lib/storage/backup.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

const PREFIX = "gateway-";

function fail(message, details = []) {
  console.error(`db-backup: ${message}`);

  for (const detail of details) console.error(`  ${detail}`);

  process.exit(1);
}

const retention = Number(process.env.BACKUP_RETENTION ?? "7");

if (!Number.isInteger(retention) || retention < 1) {
  fail("BACKUP_RETENTION must be a positive integer");
}

const directory = resolve(
  process.env.BACKUP_DIR?.trim() || join(process.cwd(), "data", "backups"),
);

mkdirSync(directory, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = join(directory, `${PREFIX}${stamp}`);

if (resolve(destination).startsWith(`${directory}${sep}`) === false) {
  fail("refusing a destination outside BACKUP_DIR");
}

/** Prunes only directories this script writes, newest first. */
function prune(keep) {
  const existing = readdirSync(directory)
    .filter((name) => name.startsWith(PREFIX))
    .map((name) => join(directory, name))
    .filter((path) => statSync(path).isDirectory() && existsSync(join(path, "manifest.json")))
    .sort((left, right) => right.localeCompare(left));

  for (const path of existing.slice(keep)) {
    rmSync(path, { recursive: true, force: true });
    console.log(`db-backup: pruned ${path}`);
  }
}

const localDirectory =
  process.env.PG_LOCAL_PATH?.trim() || join(process.cwd(), "data", "pg");
const db = await createStorageDatabase({ env: process.env, localDirectory });

try {
  const { manifest } = await dumpDatabase(db, destination);
  const rows = manifest.tables.reduce((total, table) => total + table.rows, 0);

  console.log(
    `db-backup: wrote ${destination} (${manifest.tables.length} tables, ` +
      `${rows} rows, ${manifest.balance.users} balances verified)`,
  );

  prune(retention);
} catch (error) {
  if (error instanceof BackupRefused) {
    rmSync(destination, { recursive: true, force: true });
    fail(error.message, error.details);
  }

  throw error;
} finally {
  await db.close();
}
