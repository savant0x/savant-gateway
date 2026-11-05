/**
 * Cross-instance provider-sync lease (FID-2026-1104-006).
 *
 * The per-handle promise map only coalesces one process. A row keyed by provider
 * slug makes the claim durable: a second instance cannot start the same sync
 * while the lease is live, and an abandoned claim becomes retryable when it
 * expires.
 */

import type { PostgresDatabase } from "../pg-adapter.ts";

export type ProviderSyncClaim = {
  slug: string;
  owner: string;
  at: string;
  expiresAt: string;
};

export async function claimProviderSync(
  db: PostgresDatabase,
  claim: ProviderSyncClaim,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO provider_sync_leases
        (slug, owner_token, claimed_at, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (slug) DO UPDATE
         SET owner_token = EXCLUDED.owner_token,
             claimed_at = EXCLUDED.claimed_at,
             expires_at = EXCLUDED.expires_at
         WHERE provider_sync_leases.expires_at <= EXCLUDED.claimed_at`,
    )
    .run(claim.slug, claim.owner, claim.at, claim.expiresAt);

  return result.changes > 0;
}

export async function releaseProviderSync(
  db: PostgresDatabase,
  slug: string,
  owner: string,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM provider_sync_leases
        WHERE slug = ? AND owner_token = ?`,
    )
    .run(slug, owner);
}
