/**
 * Digest day helpers (FID-2026-1102-099).
 *
 * A digest day is a UTC calendar day, matching the timestamps stored by the
 * ingestion path. Deriving the window here keeps the page from doing date
 * arithmetic with the visitor's local timezone, which would put an item in two
 * digests around midnight.
 */

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function digestDay(value: string): string | null {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function isDigestDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) && digestDay(date.toISOString()) === value
  );
}

export function digestWindow(day: string): {
  since: string;
  until: string;
} | null {
  if (!isDigestDay(day)) return null;

  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { since: start.toISOString(), until: end.toISOString() };
}

export function recentDigestDays(days: number, now = new Date()): string[] {
  const count = Math.min(31, Math.max(1, Math.trunc(days)));
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  return Array.from({ length: count }, (_, index) =>
    new Date(today.getTime() - index * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
  );
}
