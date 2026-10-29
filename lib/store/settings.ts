import "server-only";

import { db, nowIso } from "../db";
import { clampMarkupBps, DEFAULT_MARKUP_BPS } from "../pricing";

const MARKUP_KEY = "pricing.markup_bps";

export function getMarkupBps(): number {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(MARKUP_KEY) as { value: string } | undefined;

  if (!row) return DEFAULT_MARKUP_BPS;

  const parsed = Number(row.value);

  return Number.isFinite(parsed) ? clampMarkupBps(parsed) : DEFAULT_MARKUP_BPS;
}

export function saveMarkupBps(markupBps: number) {
  const value = clampMarkupBps(markupBps);

  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  ).run(MARKUP_KEY, String(value), nowIso());

  return value;
}
