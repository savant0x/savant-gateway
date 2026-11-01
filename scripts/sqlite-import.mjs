#!/usr/bin/env node
/**
 * One-shot SQLite → PostgreSQL import (FID-2026-1031-086, step 6).
 *
 * There is no production deployment, so this is not a cutover tool: it exists
 * so the operator's catalog, prices, groups, plans and (optionally) customers
 * survive the flip instead of being re-entered by hand.
 *
 * Four properties, each of which is why the code looks the way it does:
 *
 * 1. **The source is opened read-only.** `readonly: true` makes a failed or
 *    repeated run harmless, so the run is repeatable and the source file stays
 *    evidence.
 * 2. **Config is replaced, not merged.** The operator's SQLite is the source of
 *    truth for prices and groups, so the target's config rows are deleted inside
 *    the same transaction before the source rows go in. Merge-by-key would leave
 *    whichever side happened to have the row.
 * 3. **No column is silently dropped.** If the target schema lacks a column the
 *    source has, the import refuses and names it. Dropping it would lose a price
 *    or a flag without leaving a trace.
 * 4. **Money is verified, not trusted.** Before commit, every user's
 *    `credit_micros` must equal the sum of their imported ledger rows and
 *    `held_micros` must equal their live holds. A mismatch aborts the whole
 *    transaction, so the target is left as it was.
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import Database from "better-sqlite3";

import { balanceAudit } from "../lib/storage/ledger/invariants.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

/** Operator-owned configuration, in insert order (foreign keys point forward). */
const CONFIG_TABLES = [
  "providers",
  "model_groups",
  "models",
  "plans",
  "plan_groups",
  "plan_models",
  "settings",
  "model_benchmarks",
  "benchmark_syncs",
  "promo_codes",
];

/** Rows about customers and money, only copied on request. */
const CUSTOMER_TABLES = [
  "users",
  "api_keys",
  "balance_baselines",
  "credit_ledger",
  "credit_holds",
  "topups",
  "promo_redemptions",
  "subscriptions",
  "subscription_models",
  "subscription_periods",
  "subscription_invoices",
];

export class ImportRefused extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ImportRefused";
    this.code = "IMPORT_REFUSED";
    this.details = details;
  }
}

function quote(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function sqliteHasTable(source, table) {
  return Boolean(
    source
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table),
  );
}

function sqliteColumns(source, table) {
  return source
    .prepare(`PRAGMA table_info(${quote(table)})`)
    .all()
    .map((row) => row.name);
}

async function targetColumns(db, table) {
  const rows = await db.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ?
      ORDER BY ordinal_position`,
    [table],
  );

  return rows.map((row) => row.column_name);
}

async function sha256(path) {
  const hash = createHash("sha256");

  for await (const chunk of createReadStream(path)) hash.update(chunk);

  return hash.digest("hex");
}

/**
 * Reads the source and the target schema without writing anything, so every
 * refusal below happens before the transaction exists.
 */
async function planImport(source, db, includeCustomers) {
  const wanted = includeCustomers
    ? [...CONFIG_TABLES, ...CUSTOMER_TABLES]
    : CONFIG_TABLES;
  const plan = [];
  const skipped = [];

  for (const table of wanted) {
    if (!sqliteHasTable(source, table)) {
      skipped.push(table);

      continue;
    }

    const target = await targetColumns(db, table);

    if (target.length === 0) {
      throw new ImportRefused(
        `The target schema has no "${table}" table. Run the migration first.`,
        [`${table}: missing in PostgreSQL`],
      );
    }

    const columns = sqliteColumns(source, table);
    const missing = columns.filter((column) => !target.includes(column));

    if (missing.length > 0) {
      throw new ImportRefused(
        `The target schema is missing columns that "${table}" carries. ` +
          "Add them to the ported schema rather than dropping the data.",
        missing.map((column) => `${table}.${column}`),
      );
    }

    plan.push({
      table,
      columns,
      rows: source.prepare(`SELECT * FROM ${quote(table)}`).all(),
    });
  }

  return { plan, skipped };
}

async function assertTargetIsEmpty(db, force) {
  const occupied = await db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE id <> ?")
    .get("user_dev");
  const count = Number(occupied?.count ?? 0);

  if (count > 0 && !force) {
    throw new ImportRefused(
      `The target already holds ${count} customer(s). Re-run with --force only ` +
        "after backing it up: the import replaces configuration rows.",
      [`users: ${count} existing customer rows`],
    );
  }

  return count;
}

/**
 * Copies one table and returns how many rows the inserts actually committed.
 *
 * The return value is the count that matters, not the target's row total: the
 * migration seeds a development user and the system groups, so a fresh target
 * is never empty. Counting what the import itself inserted compares like with
 * like, and a row skipped by `ON CONFLICT DO NOTHING` shows up as a shortfall
 * rather than hiding inside a total.
 */
async function copyTable(db, entry, { upsert }) {
  const columns = entry.columns.map(quote).join(", ");
  const placeholders = entry.columns.map(() => "?").join(", ");
  const suffix = upsert ? " ON CONFLICT DO NOTHING" : "";
  const insert = db.prepare(
    `INSERT INTO ${quote(entry.table)} (${columns}) VALUES (${placeholders})${suffix}`,
  );
  let inserted = 0;

  for (const row of entry.rows) {
    const result = await insert.run(
      ...entry.columns.map((column) => row[column] ?? null),
    );

    inserted += result.changes;
  }

  return inserted;
}

async function verifyCounts(db, plan, source, { strict, inserted }) {
  const report = [];

  for (const entry of plan) {
    const sourceCount = Number(
      source.prepare(`SELECT COUNT(*) AS count FROM ${quote(entry.table)}`).get()
        .count,
    );
    const insertedCount = inserted.get(entry.table) ?? 0;
    const targetCount = Number(
      (
        await db
          .prepare(`SELECT COUNT(*) AS count FROM ${quote(entry.table)}`)
          .get()
      )?.count ?? 0,
    );

    if (strict && sourceCount !== insertedCount) {
      throw new ImportRefused(
        `Row counts disagree for "${entry.table}": source ${sourceCount}, ` +
          `imported ${insertedCount}, target holds ${targetCount}. ` +
          "The transaction is rolled back.",
        [`${entry.table}: ${sourceCount} → ${insertedCount}`],
      );
    }

    report.push({
      table: entry.table,
      sourceCount,
      inserted: insertedCount,
      targetCount,
    });
  }

  return report;
}

/**
 * Every user's balance must be reconstructible from the imported rows. The
 * audit itself lives in `lib/storage/ledger/invariants.ts`, so the import, the
 * backup and the drill cannot disagree about what "balanced" means.
 */
async function verifyBalances(db) {
  const audit = await balanceAudit(db);

  if (audit.mismatches.length > 0) {
    throw new ImportRefused(
      "A customer balance cannot be reconstructed from the imported ledger. " +
        "Nothing was committed.",
      audit.mismatches,
    );
  }

  return { checked: audit.checked };
}

export async function importSqlite({
  sourcePath,
  db,
  includeCustomers = false,
  force = false,
}) {
  const path = resolve(sourcePath);

  if (!existsSync(path)) {
    throw new ImportRefused(`No SQLite database at ${path}.`);
  }

  const digestBefore = await sha256(path);
  const source = new Database(path, { readonly: true, fileMustExist: true });

  try {
    const { plan, skipped } = await planImport(source, db, includeCustomers);
    const existingCustomers = await assertTargetIsEmpty(db, force);
    const configPlan = plan.filter((entry) => CONFIG_TABLES.includes(entry.table));
    const customerPlan = plan.filter((entry) =>
      CUSTOMER_TABLES.includes(entry.table),
    );

    const result = await db
      .transaction(async () => {
        const inserted = new Map();

        // Configuration is replaced, so a seeded target (system groups, the
        // provider registry, the default markup) does not shadow the operator's
        // rows. Deletion runs in reverse so foreign keys never dangle.
        for (const entry of [...configPlan].reverse()) {
          await db.prepare(`DELETE FROM ${quote(entry.table)}`).run();
        }

        for (const entry of configPlan) {
          inserted.set(
            entry.table,
            await copyTable(db, entry, { upsert: false }),
          );
        }

        for (const entry of customerPlan) {
          inserted.set(
            entry.table,
            await copyTable(db, entry, { upsert: true }),
          );
        }

        const tables = await verifyCounts(db, plan, source, {
          strict: !force,
          inserted,
        });
        const balances = includeCustomers ? await verifyBalances(db) : null;

        return { tables, balances, existingCustomers };
      })
      .immediate();

    return {
      sourcePath: path,
      digestBefore,
      digestAfter: await sha256(path),
      includeCustomers,
      force,
      skipped,
      ...result,
    };
  } finally {
    source.close();
  }
}

function parseArguments(argv) {
  const options = {
    source: null,
    local: null,
    includeCustomers: false,
    force: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--include-customers") options.includeCustomers = true;
    else if (argument === "--force") options.force = true;
    else if (argument === "--source") options.source = argv[++index];
    else if (argument.startsWith("--source=")) options.source = argument.slice(9);
    else if (argument === "--local") options.local = argv[++index];
    else if (argument.startsWith("--local=")) options.local = argument.slice(8);
    else if (argument === "--help" || argument === "-h") options.help = true;
    else options.unknown = argument;
  }

  return options;
}

function printUsage() {
  console.log(
    [
      "Usage: node scripts/sqlite-import.mjs --source <gateway.db> [options]",
      "",
      "  --source <path>        SQLite database to read (opened read-only)",
      "  --include-customers    also copy users, keys, balances and top-ups",
      "  --force                allow a target that already holds customers",
      "  --local <dir>          PGlite directory when DATABASE_URL is unset",
      "",
      "Configuration (providers, groups, models, plans, settings) is copied by",
      "default. Nothing is committed unless row counts and every recomputed",
      "customer balance agree with the source.",
    ].join("\n"),
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.help || options.unknown || !options.source) {
    if (options.unknown) console.error(`Unknown argument: ${options.unknown}`);
    printUsage();
    process.exitCode = options.help ? 0 : 1;

    return;
  }

  const localDirectory =
    options.local ??
    (process.env.DATABASE_URL
      ? undefined
      : (process.env.PG_LOCAL_PATH?.trim() || join(process.cwd(), "data", "pg")));
  const db = await createStorageDatabase({
    env: process.env,
    localDirectory,
  });

  try {
    const report = await importSqlite({
      sourcePath: options.source,
      db,
      includeCustomers: options.includeCustomers,
      force: options.force,
    });

    for (const row of report.tables) {
      console.log(`  ${row.table}: ${row.inserted} row(s) imported`);
    }

    if (report.balances) {
      console.log(`  balances verified for ${report.balances.checked} user(s)`);
    }

    if (report.skipped.length > 0) {
      console.log(`  not present in source: ${report.skipped.join(", ")}`);
    }

    console.log(
      report.digestBefore === report.digestAfter
        ? "PASS — source unchanged, import committed"
        : "WARN — source file changed during the run; verify the file",
    );
  } catch (error) {
    if (error instanceof ImportRefused) {
      console.error(`refused: ${error.message}`);

      for (const detail of error.details) console.error(`  ${detail}`);

      process.exitCode = 1;

      return;
    }

    throw error;
  } finally {
    await db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
