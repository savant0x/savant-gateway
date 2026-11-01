import type { PostgresDatabase } from "../pg-adapter.ts";

import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const MANIFEST = "manifest.json";

/**
 * Storage observation for the operations snapshot (FID-086, Batch B).
 *
 * On SQLite this read a database file and looked for `gateway-*.db` archives.
 * Neither exists now, so both halves would have quietly reported "0 bytes, no
 * backups" — a guard that never fires while looking healthy. The port replaces
 * them with what the engine actually has:
 *
 * - **Database size** comes from `pg_database_size(current_database())`, so the
 *   `OPERATIONS_DATABASE_MAX_BYTES` guard keeps its meaning. A database that
 *   refuses the measurement reports 0 (unmeasured), and the rules treat 0 as no
 *   signal rather than as a small database.
 * - **Backups** are the directory dumps `lib/storage/backup.ts` writes: each one
 *   is a directory holding `manifest.json` plus one `.jsonl` per table. Age is
 *   the manifest's mtime, so a half-written directory without a manifest is not
 *   counted as a usable backup.
 */

export function backupDirectory(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return resolve(
    /* turbopackIgnore: true */ env.BACKUP_DIR?.trim() ||
      join(/* turbopackIgnore: true */ process.cwd(), "data", "backups"),
  );
}

export function readBackupObservation(
  env: Readonly<Record<string, string | undefined>> = process.env,
  now = Date.now(),
): { backupCount: number; backupAgeSeconds: number | null } {
  const directory = backupDirectory(env);

  try {
    const stamps = readdirSync(/* turbopackIgnore: true */ directory)
      .map((name) => join(directory, name))
      .filter((path) => {
        try {
          return (
            statSync(/* turbopackIgnore: true */ path).isDirectory() &&
            statSync(/* turbopackIgnore: true */ join(path, MANIFEST)).isFile()
          );
        } catch {
          return false;
        }
      })
      .map((path) => {
        try {
          return statSync(join(path, MANIFEST)).mtimeMs;
        } catch {
          return null;
        }
      })
      .filter((value): value is number => value !== null);

    if (stamps.length === 0) {
      return { backupCount: 0, backupAgeSeconds: null };
    }

    const newest = Math.max(...stamps);

    return {
      backupCount: stamps.length,
      backupAgeSeconds: Math.max(0, Math.floor((now - newest) / 1000)),
    };
  } catch {
    return { backupCount: 0, backupAgeSeconds: null };
  }
}

export async function readDatabaseBytes(db: PostgresDatabase) {
  try {
    const row = await db
      .prepare("SELECT pg_database_size(current_database()) AS bytes")
      .get<{ bytes: number | string }>();

    return Math.max(0, Number(row?.bytes ?? 0));
  } catch {
    // Unmeasured, not small: a refused measurement must not read as a pass.
    return 0;
  }
}
