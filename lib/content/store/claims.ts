/**
 * Atomic ingestion claims (FID-2026-1104-006, extended by FID-2026-1104-015).
 *
 * A scheduled run may outlive its deadline or die mid-source. A row keyed by
 * source id lets exactly one owner hold a source until the lease expires; the
 * next tick can reclaim expired work without duplicating a cycle. The scheduler
 * claim rechecks enabled, due and configuration revision in the same statement
 * that takes ownership, so a source disabled between listing and claiming is not
 * ingested anyway.
 */

import type { PostgresDatabase } from "../../storage/pg-adapter.ts";

export type SourceClaim = {
  sourceId: string;
  owner: string;
  at: string;
  expiresAt: string;
  runId?: string | null;
  sourceRevision?: number;
};

export async function claimSource(
  db: PostgresDatabase,
  claim: SourceClaim,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO content.ingest_claims
        (source_id, owner_token, stage, claimed_at, expires_at, run_id,
         source_revision)
       VALUES (?, ?, 'claimed', ?, ?, ?, ?)
       ON CONFLICT (source_id) DO UPDATE
         SET owner_token = EXCLUDED.owner_token,
             stage = 'claimed',
             claimed_at = EXCLUDED.claimed_at,
             expires_at = EXCLUDED.expires_at,
             run_id = EXCLUDED.run_id,
             source_revision = EXCLUDED.source_revision
         WHERE content.ingest_claims.expires_at <= EXCLUDED.claimed_at`,
    )
    .run(
      claim.sourceId,
      claim.owner,
      claim.at,
      claim.expiresAt,
      claim.runId ?? null,
      claim.sourceRevision ?? 0,
    );

  return result.changes > 0;
}

/**
 * Scheduler claim. `allowNotDue` is used only by an explicit manual fetch; the
 * source still has to exist, be enabled and match the revision that was read.
 */
export async function claimDueSource(
  db: PostgresDatabase,
  claim: SourceClaim & { allowNotDue?: boolean },
): Promise<boolean> {
  const revision = claim.sourceRevision ?? 0;
  const result = await db
    .prepare(
      `INSERT INTO content.ingest_claims
        (source_id, owner_token, stage, claimed_at, expires_at, run_id,
         source_revision)
       SELECT s.id, ?, 'claimed', ?, ?, ?, ?
         FROM content.sources s
        WHERE s.id = ?
          AND s.enabled = 1
          AND s.status <> 'disabled'
          AND s.config_revision = ?
          AND (
            ? = 1
            OR s.last_fetched_at IS NULL
            OR s.last_fetched_at::timestamptz
               <= ?::timestamptz - (s.fetch_interval_minutes * INTERVAL '1 minute')
          )
       ON CONFLICT (source_id) DO UPDATE
         SET owner_token = EXCLUDED.owner_token,
             stage = 'claimed',
             claimed_at = EXCLUDED.claimed_at,
             expires_at = EXCLUDED.expires_at,
             run_id = EXCLUDED.run_id,
             source_revision = EXCLUDED.source_revision
         WHERE content.ingest_claims.expires_at <= EXCLUDED.claimed_at`,
    )
    .run(
      claim.owner,
      claim.at,
      claim.expiresAt,
      claim.runId ?? null,
      revision,
      claim.sourceId,
      revision,
      claim.allowNotDue ? 1 : 0,
      claim.at,
    );

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
