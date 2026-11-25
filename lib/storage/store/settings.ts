import type { PostgresDatabase } from "../pg-adapter.ts";

import { clampMarkupBps, DEFAULT_MARKUP_BPS } from "../../pricing.ts";

/**
 * Settings store, ported to the async handle (FID-085 step 4).
 *
 * The upsert is the reason this module is worth porting early: SQLite's
 * `ON CONFLICT(key) DO UPDATE SET value = excluded.value` has the same spelling
 * in PostgreSQL, so it is the one statement in the store layer that carries over
 * unchanged. Having it verified on the target engine means a later failure in
 * the read path is known not to come from here.
 */

const MARKUP_KEY = "pricing.markup_bps";

export async function getSetting(
  db: PostgresDatabase,
  key: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get<{ value: string }>(key);

  return row?.value ?? null;
}

/**
 * Several settings in one statement.
 *
 * A caller that needs a pair of keys — the banner needs its text and its
 * switch — read them one after another, which is two round trips for one
 * render (FID-2026-1124-005).
 */
export async function getSettings(
  db: PostgresDatabase,
  keys: string[],
): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();

  const placeholders = keys.map(() => "?").join(", ");
  const rows = await db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`)
    .all<{ key: string; value: string }>(...(keys as []));

  return new Map(rows.map((row) => [row.key, row.value]));
}

export async function saveSetting(
  db: PostgresDatabase,
  key: string,
  value: string,
  now = new Date().toISOString(),
) {
  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .run(key, value, now);
}

export async function getMarkupBps(db: PostgresDatabase): Promise<number> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get<{ value: string }>(MARKUP_KEY);

  if (!row) return DEFAULT_MARKUP_BPS;

  const parsed = Number(row.value);

  return Number.isFinite(parsed) ? clampMarkupBps(parsed) : DEFAULT_MARKUP_BPS;
}

export async function saveMarkupBps(
  db: PostgresDatabase,
  markupBps: number,
): Promise<number> {
  const value = clampMarkupBps(markupBps);

  await saveSetting(db, MARKUP_KEY, String(value));

  return value;
}
