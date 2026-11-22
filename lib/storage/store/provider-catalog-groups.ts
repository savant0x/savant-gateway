import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ProviderCatalogGroup } from "../../providers/catalog-groups.ts";

/**
 * The vendor's prefix-group snapshot, one row per group per provider.
 *
 * A sync replaces the whole set for that provider, so a group the vendor
 * removed stops being displayed, and every row carries the read time. Nothing
 * joins this table to `models`: it is a fact sheet about the vendor's pools and
 * prompt handling, and the admin catalog labels it as one.
 */

type GroupRow = {
  provider_slug: string;
  prefix: string;
  slug: string | null;
  label: string | null;
  status: string | null;
  enabled: number;
  active_providers: number | null;
  system_prompt_note: string | null;
  model_count: number | string;
  synced_at: string;
};

export async function replaceProviderCatalogGroups(
  db: PostgresDatabase,
  providerSlug: string,
  groups: ProviderCatalogGroup[],
  now = new Date().toISOString(),
) {
  await db.transaction(async () => {
    await db
      .prepare("DELETE FROM provider_catalog_groups WHERE provider_slug = ?")
      .run(providerSlug);

    for (const group of groups) {
      await db
        .prepare(
          `INSERT INTO provider_catalog_groups
            (provider_slug, prefix, slug, label, status, enabled,
             active_providers, system_prompt_note, model_count, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          providerSlug,
          group.prefix,
          group.slug,
          group.label,
          group.status,
          group.enabled ? 1 : 0,
          group.activeProviders,
          group.systemPromptNote,
          group.modelCount,
          now,
        );
    }
  })();
}

export type ProviderCatalogGroupSnapshot = ProviderCatalogGroup & {
  providerSlug: string;
  syncedAt: string;
};

/** Every provider's snapshot, newest capacity first, keyed by provider slug. */
export async function listProviderCatalogGroups(
  db: PostgresDatabase,
): Promise<Record<string, ProviderCatalogGroupSnapshot[]>> {
  const rows = await db
    .prepare(
      `SELECT provider_slug, prefix, slug, label, status, enabled,
              active_providers, system_prompt_note, model_count, synced_at
         FROM provider_catalog_groups
         ORDER BY provider_slug ASC, active_providers DESC NULLS LAST,
                  prefix ASC`,
    )
    .all<GroupRow>();
  const snapshots: Record<string, ProviderCatalogGroupSnapshot[]> = {};

  for (const row of rows) {
    (snapshots[row.provider_slug] ??= []).push({
      providerSlug: row.provider_slug,
      prefix: row.prefix,
      slug: row.slug,
      label: row.label,
      status: row.status,
      enabled: Number(row.enabled) === 1,
      activeProviders: row.active_providers,
      systemPromptNote: row.system_prompt_note,
      modelCount: Number(row.model_count),
      syncedAt: row.synced_at,
    });
  }

  return snapshots;
}
