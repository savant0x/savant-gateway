import type { PostgresDatabase } from "./pg-adapter.ts";
import type { TableRef } from "./backup-tables.ts";

/**
 * `JSON.stringify` throws on a bigint and expands a Buffer into a lossy
 * `{type:"Buffer",data:[...]}` before a replacer sees it. Only manifest-declared
 * BYTEA columns receive the base64 envelope; a JSON object that happens to use
 * `$bytea` remains ordinary JSON.
 */

export function byteaEnvelope(value: unknown): { $bytea: string } | null {
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

export function serializeRow(
  row: Record<string, unknown>,
  byteaColumns: Set<string>,
) {
  return JSON.stringify(row, (key, value) => {
    if (typeof value === "bigint") return value.toString();
    if (!byteaColumns.has(key)) return value;

    return byteaEnvelope(value) ?? value;
  });
}

export async function byteaColumnsOf(
  db: PostgresDatabase,
  table: TableRef,
): Promise<string[]> {
  const rows = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ? AND data_type = 'bytea'
      ORDER BY ordinal_position`,
    [table.schema, table.table],
  );

  return rows.map((row) => row.column_name);
}
