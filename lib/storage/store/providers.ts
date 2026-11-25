import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ProviderSummary } from "../../providers/types.ts";
import type { ProviderStatus } from "../../types.ts";
import type { ProviderInput } from "../../providers/registry.ts";

import { rekeyProviderIds } from "./provider-rekey.ts";
import {
  emptyRow,
  toObservation,
  toRecord,
  toStatus,
  type ProviderRow,
} from "./provider-rows.ts";
import { reconcileRoutes } from "./routes.ts";

/**
 * Provider registry store, ported to the async handle (FID-085 step 4).
 *
 * This module owns the registry: list, read, create, update, enable and delete.
 * How a stored row becomes a record or a status lives in `./provider-rows.ts`.
 *
 * The registry decides where a call is sent, so the mutations re-run route
 * reconciliation: enabling a provider can promote it to serving a group, and
 * deleting one can leave a group with nothing to answer its published id. Usage
 * history keeps its `model_id` strings and is never rewritten, because a deleted
 * provider must not erase the record of what was already sold.
 */

export async function getProviderRow(db: PostgresDatabase, slug: string) {
  return db
    .prepare("SELECT * FROM providers WHERE slug = ?")
    .get<ProviderRow>(slug);
}

export async function getProvider(db: PostgresDatabase, slug: string) {
  const row = await getProviderRow(db, slug);

  return row ? toRecord(row) : undefined;
}

export async function listProviderRecords(db: PostgresDatabase) {
  const rows = await db
    .prepare("SELECT * FROM providers ORDER BY sort_order ASC, label ASC")
    .all<ProviderRow>();

  return rows.map(toRecord);
}

export async function getDefaultProvider(db: PostgresDatabase) {
  const slug = await getDefaultProviderSlug(db);

  if (slug) {
    const provider = await getProvider(db, slug);

    if (provider) return provider;
  }

  return (await listProviderRecords(db)).find((provider) => provider.enabled);
}

/**
 * The slug that owns the unprefixed public id namespace and the published
 * balance badge.
 *
 * It is stored (`providers.is_default`, one holder enforced by a partial unique
 * index), not compiled. The ordering fallback exists for a database whose column
 * was added outside the migration: choosing a row is better than returning null,
 * and the result is still deterministic, so two processes agree.
 */
export async function getDefaultProviderSlug(
  db: PostgresDatabase,
): Promise<string | null> {
  const flagged = await db
    .prepare("SELECT slug FROM providers WHERE is_default = 1 LIMIT 1")
    .get<{ slug: string }>();

  if (flagged?.slug) return flagged.slug;

  const fallback = await db
    .prepare(
      `SELECT slug FROM providers
        ORDER BY enabled DESC, sort_order ASC, slug ASC
        LIMIT 1`,
    )
    .get<{ slug: string }>();

  return fallback?.slug ?? null;
}

/** In-catalog rows of one provider: the ids a switch would republish. */
export async function countPublishedProviderModels(
  db: PostgresDatabase,
  slug: string,
) {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS total FROM models WHERE upstream_slug = ? AND in_catalog = 1",
    )
    .get<{ total: number }>(slug);

  return Number(row?.total ?? 0);
}

export type DefaultProviderChange = {
  previousSlug: string | null;
  slug: string;
  /** The outgoing default's published rows: their ids gain the slug prefix. */
  previousPublishedIds: number;
  /** The incoming default's published rows: their ids lose the slug prefix. */
  publishedIds: number;
};

/**
 * Moves the default. One transaction, so no reader sees two holders or none.
 *
 * The switch re-keys the two affected providers' rows here rather than leaving
 * it to their next sync: `models` is keyed by published id while
 * `models_upstream_idx` is unique on the upstream tuple, so a flag-only switch
 * makes the next sync fail with `23505` and roll back (FID-2026-1124-004).
 * Entitlements follow the ids; `usage_events`, pricing decisions and link
 * decision history keep the string they were recorded under.
 */
export async function setDefaultProvider(
  db: PostgresDatabase,
  slug: string,
  now = new Date().toISOString(),
): Promise<DefaultProviderChange | null> {
  const target = await getProvider(db, slug);

  if (!target) return null;

  const previousSlug = await getDefaultProviderSlug(db);

  if (previousSlug === slug) {
    return {
      previousSlug,
      slug,
      previousPublishedIds: 0,
      publishedIds: await countPublishedProviderModels(db, slug),
    };
  }

  const previousPublishedIds = previousSlug
    ? await countPublishedProviderModels(db, previousSlug)
    : 0;
  const publishedIds = await countPublishedProviderModels(db, slug);

  await db
    .transaction(async () => {
      await rekeyProviderIds(
        db,
        slug,
        previousSlug ? [previousSlug, slug] : [slug],
      );
      await db.prepare("UPDATE providers SET is_default = 0").run();
      await db
        .prepare(
          "UPDATE providers SET is_default = 1, updated_at = ? WHERE slug = ?",
        )
        .run(now, slug);
    })
    .immediate();

  // The published row of a group moved with its id, so republish the serving
  // route from the rows that now exist.
  await reconcileRoutes(db);

  return { previousSlug, slug, previousPublishedIds, publishedIds };
}

export async function getProviderStatusBySlug(
  db: PostgresDatabase,
  slug: string,
): Promise<ProviderStatus> {
  const row = await getProviderRow(db, slug);

  return toStatus(db, row ?? emptyRow(slug));
}

/** Status plus capabilities from the same row, for freshness decisions. */
export async function getProviderObservation(
  db: PostgresDatabase,
  slug: string,
) {
  const row = await getProviderRow(db, slug);

  return toObservation(db, row ?? emptyRow(slug));
}

/**
 * The registry page in two statements.
 *
 * The list already read every provider row, then re-read each one by slug and
 * counted its catalog one query at a time — `1 + 2N` statements for a page that
 * held the rows already (FID-2026-1124-005). Status is derived from the row the
 * record came from, and the counts arrive in one grouped read.
 */
export async function listProviders(
  db: PostgresDatabase,
): Promise<ProviderSummary[]> {
  const rows = await db
    .prepare("SELECT * FROM providers ORDER BY sort_order ASC, label ASC")
    .all<ProviderRow>();
  const counts = await db
    .prepare(
      `SELECT upstream_slug, COUNT(*) AS total
         FROM models WHERE in_catalog = 1
        GROUP BY upstream_slug`,
    )
    .all<{ upstream_slug: string; total: number | string }>();
  const modelCounts = new Map(
    counts.map((row) => [row.upstream_slug, Number(row.total)]),
  );

  return Promise.all(
    rows.map(async (row) => ({
      ...toRecord(row),
      ...(await toStatus(db, row)),
      modelCount: modelCounts.get(row.slug) ?? 0,
    })),
  );
}

export async function createProvider(
  db: PostgresDatabase,
  input: ProviderInput,
  now = new Date().toISOString(),
) {
  await db
    .prepare(
      `INSERT INTO providers
        (slug, label, kind, base_url, key_env_var, default_headers,
         supports_balance, supports_subscription, supports_pricing,
         requires_model_review, enabled, balance_url,
         catalog_url, sort_order, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unconfigured', ?, ?)`,
    )
    .run(
      input.slug,
      input.label,
      input.kind,
      input.baseUrl,
      input.keyEnvVar,
      JSON.stringify(input.defaultHeaders),
      input.capabilities.balance ? 1 : 0,
      input.capabilities.subscription ? 1 : 0,
      input.capabilities.pricing ? 1 : 0,
      input.requiresModelReview ? 1 : 0,
      input.enabled ? 1 : 0,
      input.balanceUrl ?? null,
      input.catalogUrl ?? null,
      input.sortOrder,
      now,
      now,
    );

  return getProvider(db, input.slug);
}

export async function updateProvider(
  db: PostgresDatabase,
  slug: string,
  input: ProviderInput,
  now = new Date().toISOString(),
) {
  const result = await db
    .prepare(
      `UPDATE providers
          SET label = ?, kind = ?, base_url = ?, key_env_var = ?,
              default_headers = ?, supports_balance = ?,
              supports_subscription = ?, supports_pricing = ?,
              requires_model_review = ?, enabled = ?,
              balance_url = ?, catalog_url = ?,
              sort_order = ?,
              updated_at = ?,
              quota_observed_at = NULL, balance_observed_at = NULL,
              runtime_lease_id = NULL, runtime_lease_until = NULL
        WHERE slug = ?`,
    )
    .run(
      input.label,
      input.kind,
      input.baseUrl,
      input.keyEnvVar,
      JSON.stringify(input.defaultHeaders),
      input.capabilities.balance ? 1 : 0,
      input.capabilities.subscription ? 1 : 0,
      input.capabilities.pricing ? 1 : 0,
      input.requiresModelReview ? 1 : 0,
      input.enabled ? 1 : 0,
      input.balanceUrl ?? null,
      input.catalogUrl ?? null,
      input.sortOrder,
      now,
      slug,
    );

  if (result.changes > 0) await reconcileRoutes(db);

  return result.changes > 0 ? getProvider(db, slug) : undefined;
}

export async function setProviderEnabled(
  db: PostgresDatabase,
  slug: string,
  enabled: boolean,
  now = new Date().toISOString(),
) {
  const result = await db
    .prepare(
      `UPDATE providers
          SET enabled = ?, updated_at = ?,
              quota_observed_at = NULL, balance_observed_at = NULL,
              runtime_lease_id = NULL, runtime_lease_until = NULL
        WHERE slug = ?`,
    )
    .run(enabled ? 1 : 0, now, slug);

  if (result.changes > 0) await reconcileRoutes(db);

  return result.changes > 0;
}

/**
 * Removes a non-default provider, its catalog rows and its sync lease in one
 * transaction.
 *
 * The default check happens inside the transaction: outside it, a concurrent
 * switch could flag the row being deleted, and the switch now re-keys ids rather
 * than writing one column. `provider_sync_leases` declares no foreign key, so
 * its row would otherwise outlive the provider and be inherited by a
 * re-registration of the same slug (FID-2026-1124-006).
 */
export async function deleteProvider(db: PostgresDatabase, slug: string) {
  const removed = await db
    .transaction(async () => {
      if (slug === (await getDefaultProviderSlug(db))) return false;

      await db
        .prepare("DELETE FROM provider_sync_leases WHERE slug = ?")
        .run(slug);
      await db.prepare("DELETE FROM models WHERE upstream_slug = ?").run(slug);

      const result = await db
        .prepare("DELETE FROM providers WHERE slug = ?")
        .run(slug);

      return result.changes > 0;
    })
    .immediate();

  // The published row for a group may have been this provider's; republish the
  // group through whatever remains, or hide it when nothing does.
  if (removed) await reconcileRoutes(db);

  return removed;
}

export async function saveProviderCatalogSync(
  db: PostgresDatabase,
  slug: string,
  now = new Date().toISOString(),
) {
  await db
    .prepare("UPDATE providers SET synced_at = ? WHERE slug = ?")
    .run(now, slug);
}
