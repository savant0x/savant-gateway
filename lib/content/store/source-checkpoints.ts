import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type { SourceCheckpoint } from "../checkpoint.ts";

import { parseCheckpoint, serializeCheckpoint } from "../checkpoint.ts";

export async function saveSourceCheckpoint(
  db: PostgresDatabase,
  id: string,
  revision: number,
  checkpoint: SourceCheckpoint,
): Promise<boolean> {
  const raw = serializeCheckpoint(checkpoint);

  if (!raw) return false;

  const result = await db
    .prepare(
      `UPDATE content.sources
          SET checkpoint_json = ?, updated_at = ?
        WHERE id = ? AND config_revision = ?`,
    )
    .run(raw, new Date().toISOString(), id, revision);

  return result.changes === 1;
}

export async function readSourceCheckpoint(
  db: PostgresDatabase,
  id: string,
): Promise<SourceCheckpoint | null> {
  const row = await db
    .prepare(
      `SELECT checkpoint_json, config_revision
         FROM content.sources WHERE id = ?`,
    )
    .get<{ checkpoint_json: string | null; config_revision: number }>(id);

  if (!row) return null;

  return parseCheckpoint(row.checkpoint_json, row.config_revision);
}

export async function clearSourceCheckpoint(
  db: PostgresDatabase,
  id: string,
): Promise<void> {
  await db
    .prepare("UPDATE content.sources SET checkpoint_json = NULL WHERE id = ?")
    .run(id);
}
