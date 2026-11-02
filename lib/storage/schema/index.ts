import type { PostgresDatabase } from "../pg-adapter.ts";

import { billingSchema } from "./billing.ts";
import { catalogSchema } from "./catalog.ts";
import { contentSchema } from "./content.ts";
import { coreSchema } from "./core.ts";
import { customerSchema } from "./customers.ts";
import { identitySchema } from "./identity.ts";

/**
 * The additive migration for the Postgres port (FID-2026-1031-085, step 2).
 *
 * Order is load-bearing: `catalogSchema` must run before `billingSchema` because
 * plan and subscription tables reference `model_groups` and `models`, and
 * PostgreSQL enforces foreign keys unconditionally.
 *
 * Every statement is `IF NOT EXISTS` or `ON CONFLICT DO NOTHING`, so the whole
 * run is idempotent: a second boot changes nothing, which is what lets the
 * migration be re-run safely on every start.
 */
export async function applySchema(db: PostgresDatabase) {
  await coreSchema(db);
  await customerSchema(db);
  await catalogSchema(db);
  await billingSchema(db);
  await identitySchema(db);
  await contentSchema(db);
  await seedDevelopmentUser(db);
}

/**
 * Runs the migration inside one transaction. PostgreSQL DDL is transactional,
 * so a failure part-way leaves the schema as it was rather than half-applied.
 *
 * Call this from the caller, never from `createPostgresDatabase`'s own `migrate`
 * callback: that callback runs while initialization is still in flight, and
 * awaiting `ready()` from inside it would deadlock.
 */
export async function migrateDatabase(db: PostgresDatabase) {
  await db.ready();

  await db.transaction(async () => {
    await applySchema(db);
  })();
}

/**
 * The local developer account. Deliberately not seeded in production: the
 * SQLite schema inserts it on every boot, which puts a known `dev@local` row in
 * a live database. Nothing authenticates it (no password hash), but it does not
 * belong in a customer database either.
 */
async function seedDevelopmentUser(db: PostgresDatabase) {
  if (process.env.NODE_ENV === "production") return;

  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES ('user_dev', 'dev@local', 'Local Developer', 'active', ?)
       ON CONFLICT DO NOTHING`,
    )
    .run(new Date().toISOString());
}
