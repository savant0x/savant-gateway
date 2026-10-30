import type Database from "better-sqlite3";

export type DatabaseHandle = Database.Database;

export function hasColumn(
  database: DatabaseHandle,
  table: string,
  column: string,
) {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;

  return rows.some((row) => row.name === column);
}

/** True when SQLite rejected the ALTER because another connection won the
 * check-then-add window for the same column. */
function isDuplicateColumn(error: unknown) {
  return (
    error instanceof Error && error.message.includes("duplicate column name")
  );
}

export function ensureColumn(
  database: DatabaseHandle,
  table: string,
  column: string,
  definition: string,
) {
  if (hasColumn(database, table, column)) return;

  try {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    // The schema is additive and the read above is not atomic with the write,
    // so a second process booting against the same fresh database can add the
    // column between them. That outcome is exactly the requested end state.
    if (isDuplicateColumn(error)) return;

    throw error;
  }
}
