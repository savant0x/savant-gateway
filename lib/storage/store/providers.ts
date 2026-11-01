import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ProviderSummary } from "../../providers/types.ts";
import type { ProviderStatus } from "../../types.ts";

import {
  DEFAULT_PROVIDER_SLUG,
  type ProviderInput,
} from "../../providers/registry.ts";

import {
  emptyRow,
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
  return (
    (await getProvider(db, DEFAULT_PROVIDER_SLUG)) ??
    (await listProviderRecords(db)).find((provider) => provider.enabled)
  );
}

export async function getProviderStatusBySlug(
  db: PostgresDatabase,
  slug: string,
): Promise<ProviderStatus> {
  const row = await getProviderRow(db, slug);

  return toStatus(db, row ?? emptyRow(slug));
}

async function modelCount(db: PostgresDatabase, slug: string) {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS total FROM models WHERE upstream_slug = ? AND in_catalog = 1",
    )
    .get<{ total: number }>(slug);

  return Number(row?.total ?? 0);
}

export async function listProviders(
  db: PostgresDatabase,
): Promise<ProviderSummary[]> {
  const records = await listProviderRecords(db);

  return Promise.all(
    records.map(async (provider) => {
      const row = await getProviderRow(db, provider.slug);

      return {
        ...provider,
        ...(await toStatus(db, row ?? emptyRow(provider.slug))),
        modelCount: await modelCount(db, provider.slug),
      };
    }),
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
         supports_balance, supports_subscription, supports_pricing, enabled,
         sort_order, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unconfigured', ?, ?)`,
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
      input.enabled ? 1 : 0,
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
              supports_subscription = ?, supports_pricing = ?, enabled = ?,
              sort_order = ?, updated_at = ?,
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
      input.enabled ? 1 : 0,
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

/** Removes a non-default provider and its catalog rows in one transaction. */
export async function deleteProvider(db: PostgresDatabase, slug: string) {
  if (slug === DEFAULT_PROVIDER_SLUG) return false;

  const removed = await db
    .transaction(async () => {
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
