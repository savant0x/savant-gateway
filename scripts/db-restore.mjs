#!/usr/bin/env node
/**
 * Restore a verified logical dump into the configured database
 * (FID-2026-1031-086, step 6).
 *
 * This replaces the target's contents in one transaction. It is not a merge:
 * a target that already holds customers needs `--force`, and every failure mode
 * — a missing manifest, a short table, a checksum that disagrees, a balance the
 * ledger cannot reconstruct — rolls the transaction back so the target is left
 * exactly as it was.
 *
 * Usage:
 *   node scripts/db-restore.mjs --from /data/backups/gateway-2026-10-31T22-00-00-000Z
 *   node scripts/db-restore.mjs --from ./backup --local ./data/pg --force
 *
 * `DATABASE_URL` selects the server; without it, `PG_LOCAL_PATH` or `--local`.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { BackupRefused, restoreDatabase } from "../lib/storage/backup.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

function fail(message, details = []) {
  console.error(`db-restore: ${message}`);

  for (const detail of details) console.error(`  ${detail}`);

  process.exit(1);
}

function parseArguments(argv) {
  const options = { from: null, local: null, force: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--force") options.force = true;
    else if (argument === "--from") options.from = argv[++index];
    else if (argument.startsWith("--from=")) options.from = argument.slice(7);
    else if (argument === "--local") options.local = argv[++index];
    else if (argument.startsWith("--local=")) options.local = argument.slice(8);
    else if (argument === "--help" || argument === "-h") options.help = true;
    else fail(`unknown option ${JSON.stringify(argument)}`);
  }

  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.help || !options.from) {
    console.log(
      [
        "Usage: node scripts/db-restore.mjs --from <backup-directory> [options]",
        "",
        "  --from <dir>   directory written by scripts/db-backup.mjs",
        "  --force        replace a database that already holds customers",
        "  --local <dir>  PGlite directory when DATABASE_URL is unset",
        "",
        "A refusal rolls the transaction back; the target keeps its current rows.",
      ].join("\n"),
    );
    process.exitCode = options.help ? 0 : 1;

    return;
  }

  const localDirectory =
    options.local ??
    process.env.PG_LOCAL_PATH?.trim() ??
    resolve(process.cwd(), "data", "pg");
  const db = await createStorageDatabase({ env: process.env, localDirectory });

  try {
    const receipt = await restoreDatabase(db, resolve(options.from), {
      force: options.force,
    });
    const rows = receipt.tables.reduce((total, table) => total + table.rows, 0);

    console.log(
      `db-restore: restored ${receipt.tables.length} tables, ${rows} rows, ` +
        `${receipt.balance.users} balances verified, 0 mismatches`,
    );
    console.log(
      "db-restore: PASS — checksums, row counts and the ledger equation all agree",
    );
  } catch (error) {
    if (error instanceof BackupRefused) {
      fail(error.message, error.details);
    }

    fail(error instanceof Error ? error.message : String(error));
  } finally {
    await db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
