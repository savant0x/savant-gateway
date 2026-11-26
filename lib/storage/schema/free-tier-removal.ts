import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Removes the free tier's storage (FID-2026-1125-004 steps 3 and 4).
 *
 * Order is load-bearing. Auto-assigned rows move to the paid default before the
 * Free group can be deleted, and the group is deleted only when neither a model
 * nor a plan still references it: a plan that includes the group is a real
 * entitlement, and a cascade would silently remove it. The columns drop last,
 * because the conversion reads `group_slug` and `group_source` rather than the
 * retired `allow_free` flag.
 *
 * The ledgers go with the billing modes they recorded. `usage_events` keeps its
 * rows: past charges and their `billing_source` are history, not configuration.
 */
export async function dropLegacyFreeTier(db: PostgresDatabase) {
  await db.exec(`
    UPDATE models
       SET group_slug = 'paid', group_source = 'auto'
     WHERE group_source = 'auto' AND group_slug = 'free';

    DELETE FROM model_groups g
     WHERE g.slug = 'free'
       AND NOT EXISTS (SELECT 1 FROM models m WHERE m.group_slug = 'free')
       AND NOT EXISTS (
         SELECT 1 FROM plan_groups pg WHERE pg.group_slug = 'free'
       );

    DROP TABLE IF EXISTS trial_reservations;
    DROP TABLE IF EXISTS trial_grants;
    DROP TABLE IF EXISTS free_pool_reservations;
    DROP TABLE IF EXISTS free_pool_usage;
    DROP TABLE IF EXISTS free_pool_allocations;

    ALTER TABLE settlements DROP COLUMN IF EXISTS free_reservation_id;
    ALTER TABLE models DROP COLUMN IF EXISTS allow_free;
    ALTER TABLE models DROP COLUMN IF EXISTS token_weight;
  `);
}
