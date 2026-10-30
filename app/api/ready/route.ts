import { db } from "@/lib/db";
import {
  readinessReport,
  validateProductionConfig,
} from "@/lib/production-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED_TABLES = [
  "users",
  "api_keys",
  "usage_events",
  "settings",
  "billing_events",
] as const;

/**
 * Proves the durable volume is present and writable without keeping a row:
 * the probe runs inside a transaction that is always rolled back. A read-only
 * mount reports not-ready here instead of failing on the first customer write.
 */
function storageReady(): boolean {
  try {
    for (const table of REQUIRED_TABLES) {
      const row = db
        .prepare(
          `SELECT 1 AS present FROM sqlite_master
           WHERE type = 'table' AND name = ?`,
        )
        .get(table);

      if (!row) return false;
    }

    db.exec("BEGIN IMMEDIATE");

    try {
      db.prepare(
        `INSERT OR REPLACE INTO settings (key, value, updated_at)
         VALUES ('readiness.probe', '', ?)`,
      ).run(new Date().toISOString());
    } finally {
      if (db.inTransaction) db.exec("ROLLBACK");
    }

    return true;
  } catch {
    if (db.inTransaction) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // The connection is already unusable; the caller sees not-ready.
      }
    }

    return false;
  }
}

export async function GET() {
  const configuration = validateProductionConfig(process.env);
  const report = readinessReport({
    configuration,
    storage: storageReady(),
  });

  return Response.json(
    {
      status: report.status,
      checks: report.checks,
      // Discloses the deliberately disposable runtime instead of looking
      // identical to a durable production configuration.
      mode: configuration.disposable ? "disposable" : "durable",
    },
    {
      status: report.httpStatus,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
