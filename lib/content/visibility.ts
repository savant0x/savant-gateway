/**
 * Public model-link visibility (FID-2026-1104-016).
 *
 * A link has one durable state. Only an accepted operator decision or an
 * explicitly auto-published detection is public. Suggested, dismissed and
 * retired rows stay in the database for review and reconciliation, but every
 * public projection must exclude them. Keeping the predicate here prevents a
 * detail page, coverage query and count from disagreeing.
 */

export const CONTENT_LINK_STATES = [
  "suggested",
  "auto_published",
  "accepted",
  "dismissed",
  "retired",
] as const;

export type ContentLinkState = (typeof CONTENT_LINK_STATES)[number];

export const PUBLIC_LINK_STATES: ContentLinkState[] = [
  "accepted",
  "auto_published",
];

/** SQL list literal for `state IN (...)` without an alias. */
export const PUBLIC_LINK_STATE_SQL = PUBLIC_LINK_STATES.map(
  (state) => `'${state}'`,
).join(", ");

/** SQL predicate for a table whose link alias is `alias` (empty for none). */
export function publicLinkPredicate(alias = ""): string {
  return `${alias}state IN (${PUBLIC_LINK_STATE_SQL})`;
}

export function isPublicLinkState(state: string): boolean {
  return PUBLIC_LINK_STATES.includes(state as ContentLinkState);
}
