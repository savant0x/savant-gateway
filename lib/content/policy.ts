/**
 * Content feature policy (FID-2026-1102-090).
 *
 * The surface is enabled unless the operator explicitly turns it off. Empty
 * content is an honest empty state, not a reason to hide the navigation item;
 * an operator who wants the whole feature dark sets `CONTENT_ENABLED=false`.
 */

export function contentEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.CONTENT_ENABLED?.trim().toLowerCase() !== "false";
}

export function youtubeApiKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.YOUTUBE_API_KEY?.trim() || null;
}

export function githubToken(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.GITHUB_TOKEN?.trim() || null;
}

export function contentCronSecret(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.CONTENT_CRON_SECRET?.trim() || null;
}

/** Feed ingestion is external work; keep it behind an explicit switch. */
export function contentIngestEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.CONTENT_INGEST_ENABLED?.trim().toLowerCase() === "true";
}

export const CONTENT_LIMITS = {
  pageSize: 24,
  maxPageSize: 48,
  maxBodyChars: 120_000,
  maxExcerptChars: 480,
  maxTitleChars: 300,
  maxAuthorChars: 120,
  maxUrlChars: 2_048,
  briefingDays: 7,
  savedLimit: 50,
  watchLimit: 30,
  commentMaxChars: 2_000,
  commentsPerHour: 12,
  commentPageSize: 50,
} as const;
