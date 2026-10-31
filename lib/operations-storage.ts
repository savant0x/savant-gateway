import type { OperationsStorage } from "./operations-types.ts";

import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const BACKUP_PREFIX = "gateway-";
const BACKUP_SUFFIX = ".db";

/**
 * File size and backup age are observations of the mounted volume, not health
 * claims: a missing directory yields count 0 and an explicit null age. This is
 * separate from the server-only store so the scheduled monitor can use it
 * without importing Next's `server-only` marker.
 */
export function readStorageObservation(
  dbPath: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
  now = Date.now(),
): OperationsStorage {
  let databaseBytes = 0;

  if (dbPath !== ":memory:") {
    try {
      databaseBytes = statSync(dbPath).size;
    } catch {
      databaseBytes = 0;
    }
  }

  const backupDirectory = resolve(
    /* turbopackIgnore: true */
    env.BACKUP_DIR?.trim() ||
      join(dbPath === ":memory:" ? process.cwd() : dirname(dbPath), "backups"),
  );

  try {
    const files = readdirSync(/* turbopackIgnore: true */ backupDirectory)
      .filter(
        (name) =>
          name.startsWith(BACKUP_PREFIX) &&
          name.endsWith(BACKUP_SUFFIX) &&
          resolve(backupDirectory, name) !== resolve(dbPath),
      )
      .map((name) => {
        try {
          return statSync(join(backupDirectory, name)).mtimeMs;
        } catch {
          return null;
        }
      })
      .filter((value): value is number => value !== null);

    if (files.length === 0) {
      return { databaseBytes, backupCount: 0, backupAgeSeconds: null };
    }

    const newest = Math.max(...files);

    return {
      databaseBytes,
      backupCount: files.length,
      backupAgeSeconds: Math.max(0, Math.floor((now - newest) / 1000)),
    };
  } catch {
    return { databaseBytes, backupCount: 0, backupAgeSeconds: null };
  }
}
