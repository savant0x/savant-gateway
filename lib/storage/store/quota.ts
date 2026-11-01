import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Effective provider remaining, ported to the async handle (FID-085 step 4).
 *
 * The upstream reports a remaining balance; this function subtracts what the
 * gateway has already spent since that observation and what is currently held by
 * free-pool reservations. That makes it a conservative local estimate rather
 * than a second reading of the upstream.
 *
 * Both subqueries filter on `provider_slug`, which is why this cannot be
 * computed from the provider row alone: the answer depends on traffic recorded
 * after the observation, and `created_at` is compared as text against a stored
 * ISO timestamp, which is valid because that format sorts chronologically.
 *
 * Only this function from `lib/quota-ledger.ts` is ported here. The runtime
 * lease claim and completion belong with the provider runtime, which is a
 * separate cutover; porting them early would leave callers that cannot use them.
 */
export async function effectiveProviderRemaining(
  db: PostgresDatabase,
  input: {
    slug: string;
    remaining: number | null;
    observedAt: string | null;
    at: string;
  },
) {
  if (input.remaining === null || input.observedAt === null) return null;

  const row = await db
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(weighted_tokens), 0) FROM usage_events
           WHERE provider_slug = ? AND created_at >= ? AND weighted_tokens > 0) AS used,
         (SELECT COALESCE(SUM(weighted_tokens), 0) FROM free_pool_reservations
           WHERE provider_slug = ? AND expires_at > ?) AS held`,
    )
    .get<{ used: number; held: number }>(
      input.slug,
      input.observedAt,
      input.slug,
      input.at,
    );

  return Math.max(
    0,
    Math.floor(
      input.remaining - Number(row?.used ?? 0) - Number(row?.held ?? 0),
    ),
  );
}
