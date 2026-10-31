import type { DatabaseHandle } from "./schema/columns.ts";

/**
 * What one registered provider contributes to the catalog. Counts are read
 * from the same rows the gateway serves, so "serving" means this provider
 * currently answers those published models, not that it merely owns a row.
 */
export type ProviderCatalogSummary = {
  slug: string;
  label: string;
  enabled: boolean;
  configured: boolean;
  syncedAt: string | null;
  modelCount: number;
  activeCount: number;
  pricedCount: number;
  unknownCostCount: number;
  servingCount: number;
};

type ProviderCatalogRow = ProviderCatalogSummary & { keyEnvVar: string };

type SummaryRow = {
  slug: string;
  label: string;
  enabled: number;
  key_env_var: string;
  synced_at: string | null;
  model_count: number;
  active_count: number;
  priced_count: number;
  unknown_cost_count: number;
  serving_count: number;
};

const SUMMARY_SELECT = `
  SELECT p.slug, p.label, p.enabled, p.key_env_var, p.synced_at,
         COUNT(m.id) AS model_count,
         SUM(CASE WHEN m.status = 'active' AND m.in_catalog = 1
                  THEN 1 ELSE 0 END) AS active_count,
         SUM(CASE WHEN m.status = 'active' AND m.in_catalog = 1
                   AND (m.allow_free = 1 OR m.sell_input_micros > 0
                        OR m.sell_output_micros > 0)
                  THEN 1 ELSE 0 END) AS priced_count,
         SUM(CASE WHEN m.cost_source = 'unknown'
                  THEN 1 ELSE 0 END) AS unknown_cost_count,
         (SELECT COUNT(*) FROM models s
          WHERE s.is_primary = 1 AND s.served_provider_slug = p.slug)
           AS serving_count
  FROM providers p
  LEFT JOIN models m ON m.upstream_slug = p.slug
  GROUP BY p.slug
  ORDER BY p.sort_order ASC, p.label ASC
`;

/**
 * `configured` stays false here because it depends on the environment; the
 * store wrapper fills it from the key variable name, never the value.
 */
export function providerCatalogSummaryIn(
  database: DatabaseHandle,
): ProviderCatalogRow[] {
  const rows = database.prepare(SUMMARY_SELECT).all() as SummaryRow[];

  return rows.map((row) => ({
    slug: row.slug,
    label: row.label,
    enabled: row.enabled === 1,
    configured: false,
    syncedAt: row.synced_at,
    modelCount: row.model_count,
    activeCount: row.active_count,
    pricedCount: row.priced_count,
    unknownCostCount: row.unknown_cost_count,
    servingCount: row.serving_count,
    keyEnvVar: row.key_env_var,
  }));
}
