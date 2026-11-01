import { getAdmissionControl } from "@/lib/store-facade/insights";
import { getDatabase } from "@/lib/storage/runtime";
import {
  readinessReport,
  validateProductionConfig,
} from "@/lib/production-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Readiness against the PostgreSQL handle (FID-086, step 4).
 *
 * The probe answers the same two questions the SQLite version did: do the
 * required tables exist, and is the database writable — without keeping a row.
 * Three things changed with the dialect:
 *
 * 1. The table check reads `information_schema`, not `sqlite_master`. Both are
 *    catalog reads, but only one exists here.
 * 2. The write is an upsert on `settings.key` rather than `INSERT OR REPLACE`,
 *    which PostgreSQL does not accept.
 * 3. The rollback is a thrown sentinel. PostgreSQL cannot roll back a committed
 *    transaction and there is no `ROLLBACK` verb available to the caller, so the
 *    only way to prove a write and keep no trace is to abort the transaction
 *    that made it. The sentinel never leaves this module: it is caught here and
 *    rethrown only if some other error caused the abort.
 *
 * A read-only mount now reports not-ready at this check instead of failing on
 * the first customer write, which is the behavior the route existed for.
 */

const REQUIRED_TABLES = [
  "users",
  "api_keys",
  "usage_events",
  "settings",
  "billing_events",
] as const;

/** Aborts the probe transaction; never escapes `storageReady`. */
const PROBE_ROLLBACK = new Error("readiness probe rollback");

async function storageReady(): Promise<boolean> {
  try {
    const db = await getDatabase();

    for (const table of REQUIRED_TABLES) {
      const row = await db
        .prepare(
          `SELECT 1 AS present FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = ?`,
        )
        .get(table);

      if (!row) return false;
    }

    try {
      await db
        .transaction(async () => {
          await db
            .prepare(
              `INSERT INTO settings (key, value, updated_at)
               VALUES ('readiness.probe', '', ?)
               ON CONFLICT (key) DO UPDATE
                 SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
            )
            .run(new Date().toISOString());

          throw PROBE_ROLLBACK;
        })
        .immediate();
    } catch (error) {
      if (error !== PROBE_ROLLBACK) throw error;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Admission is informational for readiness; a missing settings row must still
 * produce the 503 readiness report instead of an unhandled 500.
 */
async function admissionState() {
  try {
    return (await getAdmissionControl()).state;
  } catch {
    return "unavailable";
  }
}

export async function GET() {
  const configuration = validateProductionConfig(process.env);
  const report = readinessReport({
    configuration,
    storage: await storageReady(),
  });

  return Response.json(
    {
      status: report.status,
      checks: report.checks,
      // Discloses the deliberately disposable runtime instead of looking
      // identical to a durable production configuration.
      mode: configuration.disposable ? "disposable" : "durable",
      // Paused and draining are admission controls, not readiness failures:
      // the operator console and payment webhooks must stay reachable.
      admission: await admissionState(),
    },
    {
      status: report.httpStatus,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
