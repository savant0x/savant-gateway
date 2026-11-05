/**
 * Atomic ingestion claims (FID-2026-1104-006).
 *
 * A scheduled run may outlive its deadline or die mid-source. A row keyed by
 * source id lets exactly one owner hold a source until the lease expires; the
 * next tick can reclaim expired work without duplicating a cycle.
 */

import type { PostgresDatabase } from "../../storage/pg-adapter.ts";

export type SourceClaim = {
  sourceId: string;
  owner: string;
  at: string;
  expiresAt: string;
};

export async function claimSource(
  db: PostgresDatabase,
  claim: SourceClaim,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO content.ingest_claims
        (source_id, owner_token, stage, claimed_at, expires_at)
       VALUES (?, ?, 'claimed', ?, ?)
       ON CONFLICT (source_id) DO UPDATE
         SET owner_token = EXCLUDED.owner_token,
             stage = 'claimed',
             claimed_at = EXCLUDED.claimed_at,
             expires_at = EXCLUDED.expires_at
         WHERE content.ingest_claims.expires_at <= EXCLUDED.claimed_at`,
    )
    .run(claim.sourceId, claim.owner, claim.at, claim.expiresAt);

  return result.changes > 0;
}

export async function markSourceClaimStage(
  db: PostgresDatabase,
  sourceId: string,
  owner: string,
  stage: "ingesting" | "done",
): Promise<void> {
  await db
    .prepare(
      `UPDATE content.ingest_claims SET stage = ?
        WHERE source_id = ? AND owner_token = ?`,
    )
    .run(stage, sourceId, owner);
}

export async function releaseSourceClaim(
  db: PostgresDatabase,
  sourceId: string,
  owner: string,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM content.ingest_claims
        WHERE source_id = ? AND owner_token = ?`,
    )
    .run(sourceId, owner);
}
