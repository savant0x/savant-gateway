import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Schema helpers for the Postgres port (FID-2026-1031-085, step 2).
 *
 * `ALTER TABLE IF EXISTS ... ADD COLUMN IF NOT EXISTS` is atomic, so two boots
 * racing on a fresh database cannot fail the way SQLite's check-then-ALTER can.
 * Identifiers are validated because they are interpolated into DDL.
 */

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertIdentifier(value: string) {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`unsafe schema identifier: ${value}`);
  }

  return value;
}

export async function hasColumn(
  db: PostgresDatabase,
  table: string,
  column: string,
) {
  const rows = await db.query<{ present: number }>(
    `SELECT 1 AS present
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
      LIMIT 1`,
    [assertIdentifier(table), assertIdentifier(column)],
  );

  return rows.length > 0;
}

export async function ensureColumn(
  db: PostgresDatabase,
  table: string,
  column: string,
  definition: string,
) {
  await db.exec(
    `ALTER TABLE IF EXISTS ${assertIdentifier(table)}
       ADD COLUMN IF NOT EXISTS ${assertIdentifier(column)} ${definition}`,
  );
}
