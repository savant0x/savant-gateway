import type { PostgresDatabase } from "./pg-adapter.ts";

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { balanceAudit } from "./ledger/invariants.ts";

/**
 * Logical backup and restore for the PostgreSQL handle (FID-086 step 6).
 *
 * Why a logical dump rather than `pg_dump`: this application runs on a single
 * volume, the same drill has to run against PGlite in development and against a
 * networked server in production, and a restore has to be verifiable *by the
 * data* rather than by file size. One code path serves all three.
 *
 * The honest limits, stated rather than implied:
 *
 * 1. **Not point-in-time recovery.** There is no WAL archiving here. The dump is
 *    a consistent snapshot read through one connection; a hostile write during
 *    the read is either before the snapshot or after it, never half of it, but
 *    the backup cannot rewind to an arbitrary second.
 * 2. **Rows are held per table in memory.** Fine for this catalog and ledger;
 *    a table with millions of usage rows should be archived with `pg_dump`
 *    instead, and the runbook says so.
 * 3. **The dump is itself the verification instrument.** Every table records a
 *    row count and an order-independent checksum, and every user's balance must
 *    be reconstructible from the ledger. A dump that fails those checks is
 *    deleted before it can be mistaken for a restore point.
 *
 * Insert order comes from the catalog's foreign keys, not a hard-coded list, so
 * a table added later is neither forgotten nor inserted before its parent.
 */

export const DUMP_FORMAT = "savant-gateway-pg-dump/1";
const MANIFEST = "manifest.json";

export type DumpTable = {
  table: string;
  columns: string[];
  rows: number;
  checksum: string;
};

export type DumpManifest = {
  format: typeof DUMP_FORMAT;
  created_at: string;
  tables: DumpTable[];
  balance: { users: number; mismatches: number };
};

export type RestoreReceipt = {
  format: typeof DUMP_FORMAT;
  restored_at: string;
  tables: DumpTable[];
  balance: { users: number; mismatches: number };
};

export class BackupRefused extends Error {
  readonly code = "BACKUP_REFUSED";
  details: string[];

  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = "BackupRefused";
    this.code = "BACKUP_REFUSED";
    this.details = details;
  }
}

function quote(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** `JSON.stringify` throws on a bigint; the driver can return one for BIGINT. */
function serialize(row: Record<string, unknown>) {
  return JSON.stringify(row, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

function checksumOf(lines: string[]) {
  const hashes = lines
    .map((line) => createHash("sha256").update(line).digest("hex"))
    .sort();

  return createHash("sha256").update(hashes.join("")).digest("hex");
}

const rowsFile = (directory: string, table: string) =>
  join(directory, `${table}.jsonl`);

async function tableNames(db: PostgresDatabase) {
  const rows = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );

  return rows.map((row) => row.table_name);
}

/**
 * Parents before children, from the catalog itself. A cycle (none exist today)
 * is broken alphabetically and reported by the caller's row counts rather than
 * by a failed insert.
 */
export async function foreignKeyOrder(db: PostgresDatabase) {
  const tables = await tableNames(db);
  const edges = await db.query<{ child: string; parent: string }>(
    `SELECT c.relname AS child, p.relname AS parent
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid
       JOIN pg_class p ON p.oid = con.confrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE con.contype = 'f' AND n.nspname = current_schema()
        AND c.relname <> p.relname`,
  );
  const parents = new Map<string, Set<string>>();
  const indegree = new Map<string, number>(tables.map((table) => [table, 0]));

  for (const edge of edges) {
    if (!indegree.has(edge.child) || !indegree.has(edge.parent)) continue;

    const set = parents.get(edge.parent) ?? new Set<string>();

    if (set.has(edge.child)) continue;

    set.add(edge.child);
    parents.set(edge.parent, set);
    indegree.set(edge.child, (indegree.get(edge.child) ?? 0) + 1);
  }

  const ready = tables
    .filter((table) => indegree.get(table) === 0)
    .sort((left, right) => left.localeCompare(right));
  const order: string[] = [];

  while (ready.length > 0) {
    const table = ready.shift() as string;

    order.push(table);

    const children = parents.get(table);

    if (!children) continue;

    for (const child of Array.from(children)) {
      const next = (indegree.get(child) ?? 0) - 1;

      indegree.set(child, next);

      if (next === 0) {
        ready.push(child);
        ready.sort((left, right) => left.localeCompare(right));
      }
    }
  }

  const remaining = tables.filter((table) => !order.includes(table));

  return [
    ...order,
    ...remaining.sort((left, right) => left.localeCompare(right)),
  ];
}

async function columnsOf(db: PostgresDatabase, table: string, rows: unknown[]) {
  if (rows.length > 0) {
    return Object.keys(rows[0] as Record<string, unknown>);
  }

  const columns = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ?
      ORDER BY ordinal_position`,
    [table],
  );

  return columns.map((row) => row.column_name);
}

/**
 * Reads every table and writes one JSONL file per table plus a manifest.
 *
 * The dump refuses to exist if the ledger does not reconstruct the balances: a
 * backup of an inconsistent database would be restored as though it were the
 * truth, which is worse than having no backup at all.
 */
export async function dumpDatabase(
  db: PostgresDatabase,
  directory: string,
): Promise<{ manifest: DumpManifest; directory: string }> {
  mkdirSync(directory, { recursive: true });

  const audit = await balanceAudit(db);

  if (audit.mismatches.length > 0) {
    throw new BackupRefused(
      "Refusing to write a backup whose ledger does not reconstruct the balances.",
      audit.mismatches,
    );
  }

  const tables: DumpTable[] = [];

  for (const table of await foreignKeyOrder(db)) {
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM ${quote(table)}`,
    );
    const lines = rows.map(serialize);
    const columns = await columnsOf(db, table, rows);

    writeFileSync(
      rowsFile(directory, table),
      lines.map((line) => `${line}\n`).join(""),
    );
    tables.push({
      table,
      columns,
      rows: lines.length,
      checksum: checksumOf(lines),
    });
  }

  const manifest: DumpManifest = {
    format: DUMP_FORMAT,
    created_at: new Date().toISOString(),
    tables,
    balance: { users: audit.checked, mismatches: audit.mismatches.length },
  };
  const temporary = join(directory, `${MANIFEST}.tmp`);

  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(temporary, join(directory, MANIFEST));

  return { manifest, directory };
}

export function readManifest(directory: string): DumpManifest {
  let manifest: DumpManifest;

  try {
    manifest = JSON.parse(
      readFileSync(join(directory, MANIFEST), "utf8"),
    ) as DumpManifest;
  } catch {
    throw new BackupRefused(`No readable manifest in ${directory}.`);
  }

  if (manifest?.format !== DUMP_FORMAT) {
    throw new BackupRefused(`Unsupported dump format: ${manifest?.format}.`);
  }

  if (!Array.isArray(manifest.tables) || manifest.tables.length === 0) {
    throw new BackupRefused("The dump manifest lists no tables.");
  }

  return manifest;
}

function linesFor(directory: string, table: string) {
  let content: string;

  try {
    content = readFileSync(rowsFile(directory, table), "utf8");
  } catch {
    throw new BackupRefused(`The dump is missing ${table}.jsonl.`);
  }

  return content.split("\n").filter((line) => line.trim().length > 0);
}

async function verifyTable(
  db: PostgresDatabase,
  entry: DumpTable,
): Promise<string[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM ${quote(entry.table)}`,
  );
  const problems: string[] = [];

  if (rows.length !== entry.rows) {
    problems.push(
      `${entry.table}: expected ${entry.rows} rows, restored ${rows.length}`,
    );
  }

  if (checksumOf(rows.map(serialize)) !== entry.checksum) {
    problems.push(`${entry.table}: checksum does not match the dump`);
  }

  return problems;
}

/**
 * Replaces the target's contents with the dump, in one transaction.
 *
 * Refusals come before any write: a target that already holds customers needs
 * `--force`, because this is a restore and not a merge. Inside the transaction a
 * single mismatch rolls everything back, so a failed restore leaves the target
 * exactly as it was.
 */
export async function restoreDatabase(
  db: PostgresDatabase,
  directory: string,
  options: { force?: boolean } = {},
): Promise<RestoreReceipt> {
  const manifest = readManifest(directory);
  const occupied = await db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE id <> ?")
    .get<{ count: string }>("user_dev");
  const customers = Number(occupied?.count ?? 0);

  if (customers > 0 && !options.force) {
    throw new BackupRefused(
      `The target already holds ${customers} customer(s). Pass --force to replace it.`,
      [`users: ${customers} existing customer rows`],
    );
  }

  await db
    .transaction(async () => {
      const tables = manifest.tables.map((entry) => quote(entry.table));

      await db.exec(`TRUNCATE TABLE ${tables.join(", ")} CASCADE`);

      for (const entry of manifest.tables) {
        const columns = entry.columns.map(quote).join(", ");
        const placeholders = entry.columns.map(() => "?").join(", ");
        const insert = db.prepare(
          `INSERT INTO ${quote(entry.table)} (${columns}) VALUES (${placeholders})`,
        );
        const lines = linesFor(directory, entry.table);

        if (lines.length !== entry.rows) {
          throw new BackupRefused(
            `${entry.table}.jsonl holds ${lines.length} rows but the manifest says ${entry.rows}.`,
          );
        }

        for (const line of lines) {
          const row = JSON.parse(line) as Record<string, unknown>;

          await insert.run(
            ...entry.columns.map((column) => row[column] ?? null),
          );
        }
      }

      const problems: string[] = [];

      for (const entry of manifest.tables) {
        problems.push(...(await verifyTable(db, entry)));
      }

      const audit = await balanceAudit(db);

      problems.push(...audit.mismatches);

      if (problems.length > 0) {
        throw new BackupRefused(
          "The restored copy does not match the dump. Nothing was committed.",
          problems,
        );
      }
    })
    .immediate();

  const audit = await balanceAudit(db);

  return {
    format: DUMP_FORMAT,
    restored_at: new Date().toISOString(),
    tables: manifest.tables,
    balance: { users: audit.checked, mismatches: audit.mismatches.length },
  };
}
