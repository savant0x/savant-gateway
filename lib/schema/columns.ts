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

export function ensureColumn(
  database: DatabaseHandle,
  table: string,
  column: string,
  definition: string,
) {
  if (hasColumn(database, table, column)) return;

  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
