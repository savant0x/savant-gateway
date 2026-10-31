#!/usr/bin/env node
/**
 * Restore a checksummed backup into a new, isolated database file.
 *
 * This is deliberately not a "copy over the live file" tool. It verifies the
 * backup's sidecar and SHA-256, opens the copy read-only, checks integrity,
 * foreign keys, required tables and the credit equation, and only then renames
 * the verified file into place. The live database is never touched, and an
 * existing target is never overwritten.
 *
 * Usage:
 *   node scripts/db-restore.mjs \
 *     --backup /data/backups/gateway-2026-10-31T00-00-00-000Z.db \
 *     --target /data/restore/gateway.db
 *
 * Use `--allow-unverified` only for a legacy backup that has no sidecar; the
 * restore receipt records that it was not checksum-verified.
 */
import { createHash } from "node:crypto";
import { copyFileSync, createReadStream, chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import Database from "better-sqlite3";

const FORMAT = "savant-backup/1";
const RECEIPT_FORMAT = "savant-restore/1";
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
  console.error(`db-restore: ${message}`);
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

function parseArgs(argv) {
  const values = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (!argument.startsWith("--")) {
      fail(`unexpected argument ${JSON.stringify(argument)}`);
    }

    const [key, inline] = argument.slice(2).split("=");

    if (inline !== undefined) {
      values[key] = inline;
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      values[key] = argv[index + 1];
      index += 1;
    } else {
      values[key] = true;
    }
  }

  return values;
}

const args = parseArgs(process.argv.slice(2));
const allowed = new Set(["backup", "target", "allow-unverified"]);

for (const key of Object.keys(args)) {
  if (!allowed.has(key)) fail(`unknown option --${key}`);
}

if (typeof args.backup !== "string" || !args.backup.trim()) {
  fail("--backup is required and must name a .db backup file");
}

if (typeof args.target !== "string" || !args.target.trim()) {
  fail("--target is required and must name a new .db file");
}

const backupPath = resolve(args.backup);
const targetPath = resolve(args.target);
const allowUnverified = args["allow-unverified"] === true;

if (backupPath === targetPath) fail("--backup and --target must be different files");

if (!backupPath.endsWith(".db")) fail("--backup must end in .db");
if (!targetPath.endsWith(".db")) fail("--target must end in .db");

if (!existsSync(backupPath)) fail(`backup not found: ${backupPath}`);
if (existsSync(targetPath)) {
  fail(`target already exists: ${targetPath}; choose a new isolated path`);
}

const livePath = process.env.DB_PATH?.trim();

if (livePath && resolve(livePath) === targetPath) {
  fail("refusing to restore over the live DB_PATH; use an isolated target");
}

for (const suffix of SIBLINGS) {
  const sibling = `${backupPath}${suffix}`;

  if (existsSync(sibling) && statSync(sibling).size > 0) {
    fail(
      `backup has a non-empty ${suffix} sibling; only a self-contained backup file is supported`,
    );
  }
}

const backupBytes = statSync(backupPath).size;
const metadataPath = `${backupPath}.json`;
let metadata = null;

if (existsSync(metadataPath)) {
  try {
    metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  } catch {
    fail(`backup metadata is not valid JSON: ${metadataPath}`);
  }

  if (metadata?.format !== FORMAT) {
    fail(`backup metadata has an unsupported format: ${metadata?.format}`);
  }

  if (metadata.file !== basename(backupPath)) {
    fail("backup metadata names a different file");
  }

  if (typeof metadata.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(metadata.sha256)) {
    fail("backup metadata has no valid SHA-256");
  }

  if (metadata.bytes !== backupBytes) {
    fail(
      `backup size ${backupBytes} does not match metadata ${metadata.bytes}`,
    );
  }

  if (metadata.integrity !== "ok") {
    fail(`backup metadata reports integrity ${JSON.stringify(metadata.integrity)}`);
  }
} else if (!allowUnverified) {
  fail(
    `backup metadata missing: ${metadataPath}; re-run the backup or pass --allow-unverified for a legacy file`,
  );
}

const actualSha256 = await sha256File(backupPath);

if (metadata && metadata.sha256 !== actualSha256) {
  fail(
    `backup checksum mismatch (metadata ${metadata.sha256}, actual ${actualSha256})`,
  );
}

const targetDirectory = dirname(targetPath);

mkdirSync(targetDirectory, { recursive: true });

const temporary = `${targetPath}.restoring-${process.pid}`;

function removeTemporary() {
  rmSync(temporary, { force: true });

  for (const suffix of SIBLINGS) {
    rmSync(`${temporary}${suffix}`, { force: true });
  }
}

try {
  copyFileSync(backupPath, temporary);
  restrict(temporary, 0o600);
} catch (error) {
  removeTemporary();
  fail(
    `could not copy the backup: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

let database = null;

try {
  database = new Database(temporary, { readonly: true, fileMustExist: true });
  database.pragma("busy_timeout = 5000");

  const integrityRows = database.pragma("integrity_check");
  const integrity = integrityRows.map((row) => Object.values(row)[0]);

  if (integrity.length !== 1 || integrity[0] !== "ok") {
    throw new Error(`integrity_check reported ${JSON.stringify(integrity)}`);
  }

  const foreignKeys = database.pragma("foreign_key_check");

  if (foreignKeys.length > 0) {
    throw new Error(
      `foreign_key_check reported ${foreignKeys.length} violation(s): ${JSON.stringify(
        foreignKeys.slice(0, 3),
      )}`,
    );
  }

  const tableNames = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
  const missing = REQUIRED_TABLES.filter((table) => !tableNames.includes(table));

  if (missing.length > 0) {
    throw new Error(`restored copy is missing required tables: ${missing.join(", ")}`);
  }

  const hasTable = (name) => tableNames.includes(name);
  const scalar = (sql) => {
    const row = database.prepare(sql).get();

    return Number(Object.values(row ?? {})[0] ?? 0);
  };
  const count = (table, where = "") =>
    scalar(`SELECT COUNT(*) AS total FROM ${table}${where ? ` WHERE ${where}` : ""}`);
  const sum = (table, column, where = "") =>
    scalar(
      `SELECT COALESCE(SUM(${column}), 0) AS total FROM ${table}${
        where ? ` WHERE ${where}` : ""
      }`,
    );

  const baselineSql = hasTable("balance_baselines")
    ? `COALESCE((
         SELECT bb.baseline_micros FROM balance_baselines bb
         WHERE bb.user_id = u.id
         ORDER BY bb.created_at DESC LIMIT 1
       ), 0)`
    : "0";

  const balanceMicros = sum("users", "credit_micros");
  const ledgerMicros = sum("credit_ledger", "amount_micros");
  const baselineMicros = hasTable("balance_baselines")
    ? scalar(
        `SELECT COALESCE(SUM(b.baseline_micros), 0) AS total
         FROM balance_baselines b
         WHERE b.created_at = (
           SELECT MAX(created_at) FROM balance_baselines
           WHERE user_id = b.user_id
         )`,
      )
    : 0;
  const expectedMicros = baselineMicros + ledgerMicros;
  const unbalancedAccounts = scalar(
    `SELECT COUNT(*) AS total FROM (
       SELECT u.id,
         u.credit_micros - (${baselineSql}) - COALESCE((
           SELECT SUM(cl.amount_micros) FROM credit_ledger cl
           WHERE cl.user_id = u.id
         ), 0) AS difference
       FROM users u
     ) WHERE difference != 0`,
  );
  const negativeBalances = count("users", "credit_micros < 0");
  const orphanLedgerRows = count(
    "credit_ledger",
    "user_id NOT IN (SELECT id FROM users)",
  );
  const unresolvedSettlements = count("settlements", "status = 'admitted'");
  const quarantinedHolds = count("quarantined_holds", "status = 'quarantined'");

  const financial = {
    balance_micros: balanceMicros,
    ledger_micros: ledgerMicros,
    baseline_micros: baselineMicros,
    expected_micros: expectedMicros,
    difference_micros: balanceMicros - expectedMicros,
    balanced: unbalancedAccounts === 0,
    unbalanced_accounts: unbalancedAccounts,
    negative_balances: negativeBalances,
    orphan_ledger_rows: orphanLedgerRows,
    topup_micros_paid: sum("topups", "amount_micros", "status = 'paid'"),
    usage_debits_micros: sum("usage_events", "charged_micros", "charged_micros > 0"),
    held_micros: sum("credit_holds", "hold_micros"),
    quarantined_micros: sum(
      "quarantined_holds",
      "reserved",
      "kind = 'credit' AND status = 'quarantined'",
    ),
    unresolved_settlements: unresolvedSettlements,
    quarantined_holds: quarantinedHolds,
  };

  if (financial.unbalanced_accounts > 0) {
    throw new Error(
      `credit equation fails for ${financial.unbalanced_accounts} account(s) ` +
        `(difference ${financial.difference_micros} micros)`,
    );
  }

  if (financial.negative_balances > 0) {
    throw new Error(
      `${financial.negative_balances} account(s) have negative credit`,
    );
  }

  if (financial.orphan_ledger_rows > 0) {
    throw new Error(
      `${financial.orphan_ledger_rows} ledger row(s) reference a missing user`,
    );
  }

  const counts = Object.fromEntries(
    [
      "users",
      "api_keys",
      "credit_ledger",
      "credit_holds",
      "topups",
      "usage_events",
      "settlements",
      "quarantined_holds",
      "billing_events",
    ].map((table) => [table, count(table)]),
  );
  const userVersion = database.pragma("user_version", { simple: true });

  database.close();
  database = null;

  for (const suffix of SIBLINGS) {
    rmSync(`${temporary}${suffix}`, { force: true });
  }

  renameSync(temporary, targetPath);
  restrict(targetPath, 0o600);

  const receipt = {
    format: RECEIPT_FORMAT,
    target: basename(targetPath),
    backup: basename(backupPath),
    backup_sha256: actualSha256,
    verified: metadata !== null,
    allow_unverified: metadata === null && allowUnverified,
    verified_at: new Date().toISOString(),
    integrity: "ok",
    foreign_key_violations: 0,
    user_version: userVersion,
    tables: tableNames.length,
    counts,
    financial,
  };
  const receiptPath = `${targetPath}.restore.json`;
  const receiptTemporary = `${receiptPath}.tmp`;

  writeFileSync(receiptTemporary, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  });
  restrict(receiptTemporary, 0o600);
  renameSync(receiptTemporary, receiptPath);

  console.log(
    `db-restore: restored ${targetPath} (${tableNames.length} tables, ` +
      `${financial.balance_micros} micros credit, ` +
      `${financial.unresolved_settlements} unresolved settlement(s), integrity ok)`,
  );
  console.log(`db-restore: receipt ${receiptPath}`);
} catch (error) {
  if (database) database.close();

  removeTemporary();
  rmSync(`${targetPath}.restore.json.tmp`, { force: true });

  fail(
    `restore verification failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}
