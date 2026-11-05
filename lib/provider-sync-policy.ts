/** Pure staleness policy for automatic provider sync; no database, no network. */

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * How old a provider's catalog may be before the read path asks for a sync.
 * `0` disables the automatic refresh; a malformed value keeps the default so a
 * typo can never silently stop syncing.
 */
export function syncIntervalMs(value: string | undefined) {
  // A blank value is a missing value, not 0. Treating it as 0 would let an
  // empty `PROVIDER_SYNC_INTERVAL_HOURS=` silently disable automatic sync.
  const trimmed = value?.trim();

  if (!trimmed) return DEFAULT_INTERVAL_MS;

  const hours = Number(trimmed);

  if (!Number.isFinite(hours) || hours < 0) return DEFAULT_INTERVAL_MS;

  return hours === 0 ? 0 : hours * 60 * 60 * 1000;
}

export type SyncDueRow = {
  slug: string;
  enabled: boolean;
  configured: boolean;
  syncedAt: string | null;
};

/**
 * Providers whose catalog is stale enough to refresh. A provider that is
 * disabled or has no credential is skipped: it cannot sync, and counting it
 * would make every page view retry a call that must fail.
 */
export function providersDue(
  rows: SyncDueRow[],
  now: number,
  intervalMs: number,
): string[] {
  if (intervalMs <= 0) return [];

  return rows
    .filter((row) => row.enabled && row.configured)
    .filter((row) => {
      if (!row.syncedAt) return true;

      const at = Date.parse(row.syncedAt);

      return !Number.isFinite(at) || now - at >= intervalMs;
    })
    .map((row) => row.slug);
}

/**
 * Secrets that may authenticate the provider scheduler. Both names are
 * accepted at once: Vercel Cron injects `CRON_SECRET`, while a generic
 * scheduler may use `PROVIDER_CRON_SECRET`. A precedence rule would make the
 * other name fail when both are configured.
 */
export function providerCronSecrets(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const values = [env.PROVIDER_CRON_SECRET, env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(values));
}
