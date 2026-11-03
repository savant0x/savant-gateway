/**
 * Public Signal search is a navigation aid, not a corpus API (FID-2026-1102-102).
 * It rejects a one-character query before any database read and caps the input
 * length; the route caps every result group independently.
 */

export const CONTENT_SEARCH_LIMITS = {
  minChars: 2,
  maxChars: 120,
  itemLimit: 5,
  modelLimit: 3,
  topicLimit: 3,
} as const;

export type SearchQuery =
  { ok: true; query: string } | { ok: false; error: string };

export function parseSearchQuery(raw: string | null | undefined): SearchQuery {
  const query = raw?.trim() ?? "";

  if (query.length === 0) {
    return { ok: false, error: "Type at least two characters to search." };
  }

  if (query.length < CONTENT_SEARCH_LIMITS.minChars) {
    return { ok: false, error: "Type at least two characters to search." };
  }

  if (query.length > CONTENT_SEARCH_LIMITS.maxChars) {
    return {
      ok: false,
      error: `Search is limited to ${CONTENT_SEARCH_LIMITS.maxChars} characters.`,
    };
  }

  return { ok: true, query };
}
