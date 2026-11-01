import type { PostgresDatabase } from "../pg-adapter.ts";

import { canonicalModelKey } from "../../model-identity.ts";
import { normalizeFamilyName } from "../../model-family.ts";
import { SYSTEM_GROUP_DEFINITIONS } from "../../model-groups.ts";

/**
 * Seed and backfill statements for the catalog, split out of `catalog.ts` so
 * that module stays a pure table definition. Ported from `lib/schema/*` for
 * FID-085 step 2.
 *
 * Each function rewrites only rows that match a legacy shape, so a second boot
 * changes nothing.
 */
export async function catalogSeeds(db: PostgresDatabase) {
  await seedSystemGroups(db);
  await backfillModelGroups(db);
  await backfillCostSource(db);
  await normalizeLegacyFamilies(db);
  await backfillRouteGroups(db);
  await seedProviders(db);
  await adoptDocumentedApixoKey(db);
}

async function seedSystemGroups(db: PostgresDatabase) {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO model_groups
       (slug, label, billing_mode, description, sort_order, is_system,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  );

  for (const group of SYSTEM_GROUP_DEFINITIONS) {
    await insert.run(
      group.slug,
      group.label,
      group.billingMode,
      group.description,
      group.sortOrder,
      group.isSystem ? 1 : 0,
      now,
      now,
    );
  }

  // System groups own their slug and billing behavior. Labels, descriptions and
  // order remain operator-editable.
  await db.exec(`
    UPDATE model_groups SET is_system = 1
      WHERE slug IN ('free', 'paid', 'subscription');
    UPDATE model_groups SET billing_mode = 'free' WHERE slug = 'free';
    UPDATE model_groups SET billing_mode = 'paid' WHERE slug = 'paid';
    UPDATE model_groups SET billing_mode = 'subscription'
      WHERE slug = 'subscription';
  `);
}

async function backfillModelGroups(db: PostgresDatabase) {
  await db.exec(`
    UPDATE models
       SET group_slug = CASE
             WHEN allow_free = 1 AND token_weight > 0 THEN 'free'
             WHEN upstream_id LIKE 'free/%' THEN 'subscription'
             ELSE 'paid'
           END
     WHERE group_slug IS NULL OR group_slug = '';
  `);
}

async function backfillCostSource(db: PostgresDatabase) {
  await db.exec(`
    UPDATE models
       SET cost_source = CASE
             WHEN allow_free = 1 AND token_weight > 0 THEN 'synced'
             WHEN input_price_micros > 0 OR output_price_micros > 0 THEN 'synced'
             ELSE 'unknown'
           END
     WHERE cost_source = 'unknown';
  `);
}

/** Rewrites rows where the upstream price-group sentinel leaked into `family`. */
async function normalizeLegacyFamilies(db: PostgresDatabase) {
  const rows = await db
    .prepare(
      "SELECT id, provider FROM models WHERE lower(trim(provider)) IN ('free', '')",
    )
    .all<{ id: string; provider: string }>();

  if (rows.length === 0) return;

  const update = db.prepare("UPDATE models SET provider = ? WHERE id = ?");

  for (const row of rows) {
    await update.run(normalizeFamilyName(row.id, row.provider), row.id);
  }
}

/** Fills the provider-neutral route key for rows that predate it. */
async function backfillRouteGroups(db: PostgresDatabase) {
  const rows = await db
    .prepare(
      "SELECT id, upstream_id FROM models WHERE route_group IS NULL OR route_group = ''",
    )
    .all<{ id: string; upstream_id: string }>();

  if (rows.length === 0) return;

  const update = db.prepare("UPDATE models SET route_group = ? WHERE id = ?");

  for (const row of rows) {
    await update.run(canonicalModelKey(row.upstream_id), row.id);
  }
}

/**
 * The default provider inherits the legacy environment triple and status row.
 * CommandCode is registered up front but stays unconfigured until its key
 * exists; Apixo ships disabled because its catalog sync needs a key.
 */
async function seedProviders(db: PostgresDatabase) {
  const now = new Date().toISOString();
  const legacy = await db
    .prepare("SELECT * FROM provider_status WHERE id = 1")
    .get<Record<string, unknown>>();
  const baseUrl =
    process.env.PROVIDER_BASE_URL?.trim() || "https://api.apinex.bond/v1";

  await db
    .prepare(
      `INSERT INTO providers
        (slug, label, kind, base_url, key_env_var, default_headers,
         supports_balance, supports_subscription, supports_pricing, enabled,
         sort_order, status, balance_usd, rpm, rpm_plan, subscription_mode,
         subscription_plan, subscription_token_limit,
         subscription_tokens_used, subscription_tokens_remaining,
         subscription_allowed, subscription_expires_at, synced_at, error,
         created_at, updated_at)
       VALUES ('savant', 'Savant', 'openai', ?, 'PROVIDER_KEY', ?, 1, 1, 1, 1,
               10, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
    )
    .run(
      baseUrl.replace(/\/+$/, ""),
      JSON.stringify({ src: "gate" }),
      String(legacy?.status ?? "unconfigured"),
      legacy?.balance_usd ?? null,
      legacy?.rpm ?? null,
      legacy?.rpm_plan ?? null,
      legacy?.subscription_mode ?? null,
      legacy?.subscription_plan ?? null,
      legacy?.subscription_token_limit ?? null,
      legacy?.subscription_tokens_used ?? null,
      legacy?.subscription_tokens_remaining ?? null,
      legacy?.subscription_allowed ?? null,
      legacy?.subscription_expires_at ?? null,
      legacy?.synced_at ?? null,
      legacy?.error ?? null,
      now,
      now,
    );

  await db
    .prepare(
      `INSERT INTO providers
        (slug, label, kind, base_url, key_env_var, default_headers,
         supports_balance, supports_subscription, supports_pricing, enabled,
         sort_order, status, created_at, updated_at)
       VALUES ('commandcode', 'CommandCode', 'both',
               'https://api.commandcode.ai/provider/v1',
               'COMMANDCODE_API_KEY', '{}', 0, 0, 0, 1, 20,
               'unconfigured', ?, ?)
       ON CONFLICT DO NOTHING`,
    )
    .run(now, now);

  await db
    .prepare(
      `INSERT INTO providers
        (slug, label, kind, base_url, key_env_var, default_headers,
         supports_balance, supports_subscription, supports_pricing, enabled,
         sort_order, status, created_at, updated_at)
       VALUES ('apixo', 'Apixo', 'both',
               'https://api.apixoai.online/v1',
               'APIXOAI_API_KEY', '{}', 0, 0, 0, 0, 30,
               'unconfigured', ?, ?)
       ON CONFLICT DO NOTHING`,
    )
    .run(now, now);
}

/**
 * Apixo documents its credential as APIXOAI_API_KEY. Renaming only that exact
 * stored value keeps a deliberate operator edit intact.
 */
async function adoptDocumentedApixoKey(db: PostgresDatabase) {
  await db
    .prepare(
      `UPDATE providers
          SET key_env_var = 'APIXOAI_API_KEY', updated_at = ?
        WHERE slug = 'apixo' AND key_env_var = 'APIXO_API_KEY'`,
    )
    .run(new Date().toISOString());
}
