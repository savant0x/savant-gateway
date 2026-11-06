import type { PostgresDatabase } from "./pg-adapter.ts";
import type { TableRef } from "./backup-tables.ts";

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  columnsOf,
  foreignKeyOrder,
  qualifiedTable,
  quote,
} from "./backup-tables.ts";
import { balanceAudit } from "./ledger/invariants.ts";

export { foreignKeyOrder };
export type { TableRef } from "./backup-tables.ts";

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

export const DUMP_FORMAT = "savant-gateway-pg-dump/2";
export const LEGACY_DUMP_FORMAT = "savant-gateway-pg-dump/1";
const MANIFEST = "manifest.json";

export type DumpTable = TableRef & {
  columns: string[];
  rows: number;
  checksum: string;
};

export type DumpManifest = {
  format: typeof DUMP_FORMAT | typeof LEGACY_DUMP_FORMAT;
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

/**
 * `JSON.stringify` throws on a bigint and expands a Buffer into a lossy
 * `{type:"Buffer",data:[...]}` before the replacer sees it. Byte columns need an
 * explicit base64 envelope so a restore can pass bytes rather than an object to
 * the driver. This is additive: every other column keeps its previous shape.
 */
function byteaEnvelope(value: unknown): { $bytea: string } | null {
  if (value instanceof Uint8Array) {
    return { $bytea: Buffer.from(value).toString("base64") };
  }
  if (
    value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "Buffer" &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return {
      $bytea: Buffer.from((value as { data: number[] }).data).toString(
        "base64",
      ),
    };
  }

  return null;
}

function serialize(row: Record<string, unknown>) {
  return JSON.stringify(row, (_key, value) => {
    if (typeof value === "bigint") return value.toString();

    return byteaEnvelope(value) ?? value;
  });
}

/** Reverses the `$bytea` envelope for a restore parameter. */
function restoreValue(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { $bytea?: unknown }).$bytea === "string"
  ) {
    return Buffer.from((value as { $bytea: string }).$bytea, "base64");
  }

  return value ?? null;
}

function checksumOf(lines: string[]) {
  const hashes = lines
    .map((line) => createHash("sha256").update(line).digest("hex"))
    .sort();

  return createHash("sha256").update(hashes.join("")).digest("hex");
}

function rowsFileName(table: TableRef, format: DumpManifest["format"]) {
  return format === LEGACY_DUMP_FORMAT
    ? `${table.table}.jsonl`
    : `${table.schema}.${table.table}.jsonl`;
}

const rowsFile = (
  directory: string,
  table: TableRef,
  format: DumpManifest["format"],
) => join(directory, rowsFileName(table, format));

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
      `SELECT * FROM ${qualifiedTable(table)}`,
    );
    const lines = rows.map(serialize);
    const columns = await columnsOf(db, table, rows);

    writeFileSync(
      rowsFile(directory, table, DUMP_FORMAT),
      lines.map((line) => `${line}\n`).join(""),
    );
    tables.push({
      schema: table.schema,
      table: table.table,
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
  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(join(directory, MANIFEST), "utf8"));
  } catch {
    throw new BackupRefused(`No readable manifest in ${directory}.`);
  }

  const manifest = parsed as {
    format?: unknown;
    created_at?: unknown;
    tables?: unknown;
    balance?: unknown;
  };
  const format = manifest?.format;

  if (format !== DUMP_FORMAT && format !== LEGACY_DUMP_FORMAT) {
    throw new BackupRefused(`Unsupported dump format: ${String(format)}.`);
  }

  if (!Array.isArray(manifest.tables) || manifest.tables.length === 0) {
    throw new BackupRefused("The dump manifest lists no tables.");
  }

  const tables: DumpTable[] = manifest.tables.map((value) => {
    const entry = value as Partial<DumpTable> & { schema?: unknown };

    return {
      schema:
        typeof entry.schema === "string" && entry.schema
          ? entry.schema
          : "public",
      table: String(entry.table ?? ""),
      columns: Array.isArray(entry.columns)
        ? entry.columns.map((column) => String(column))
        : [],
      rows: Number(entry.rows ?? 0),
      checksum: String(entry.checksum ?? ""),
    };
  });
  const balance = manifest.balance as
    { users?: unknown; mismatches?: unknown } | undefined;

  return {
    format,
    created_at: String(manifest.created_at ?? ""),
    tables,
    balance: {
      users: Number(balance?.users ?? 0),
      mismatches: Number(balance?.mismatches ?? 0),
    },
  };
}

function linesFor(
  directory: string,
  table: DumpTable,
  format: DumpManifest["format"],
) {
  let content: string;

  try {
    content = readFileSync(rowsFile(directory, table, format), "utf8");
  } catch {
    throw new BackupRefused(
      `The dump is missing ${rowsFileName(table, format)}.`,
    );
  }

  return content.split("\n").filter((line) => line.trim().length > 0);
}

async function verifyTable(
  db: PostgresDatabase,
  entry: DumpTable,
): Promise<string[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM ${qualifiedTable(entry)}`,
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
      const tables = manifest.tables.map((entry) => qualifiedTable(entry));

      await db.exec(`TRUNCATE TABLE ${tables.join(", ")} CASCADE`);

      for (const entry of manifest.tables) {
        const columns = entry.columns.map(quote).join(", ");
        const placeholders = entry.columns.map(() => "?").join(", ");
        const insert = db.prepare(
          `INSERT INTO ${qualifiedTable(entry)} (${columns}) VALUES (${placeholders})`,
        );
        const lines = linesFor(directory, entry, manifest.format);

        if (lines.length !== entry.rows) {
          throw new BackupRefused(
            `${rowsFileName(entry, manifest.format)} holds ${lines.length} rows but the manifest says ${entry.rows}.`,
          );
        }

        for (const line of lines) {
          const row = JSON.parse(line) as Record<string, unknown>;

          await insert.run(
            ...entry.columns.map((column) => restoreValue(row[column])),
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
