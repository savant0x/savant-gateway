import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Shared admission state (FID-2026-1104-004).
 *
 * `admission_buckets` holds the token arithmetic for one provider account or
 * one completion bucket. `admission_leases` holds the in-flight slots that make
 * concurrency an aggregate ceiling. A lease expires on its own, so a crashed
 * instance cannot strand capacity and no sweeper job is required.
 *
 * Epoch milliseconds are stored as BIGINT: they compare exactly and do not
 * depend on a session time zone or on a timestamp parser.
 */
export async function admissionSchema(db: PostgresDatabase) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS admission_buckets (
      scope TEXT NOT NULL,
      bucket_key TEXT NOT NULL,
      tokens DOUBLE PRECISION NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (scope, bucket_key)
    );

    CREATE TABLE IF NOT EXISTS admission_leases (
      lease_id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      bucket_key TEXT NOT NULL,
      expires_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS admission_leases_key_idx
      ON admission_leases(scope, bucket_key, expires_at);
  `);
}
