import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  AdmissionState,
  OperationsSnapshot,
  OperationsStorage,
  OperationsThresholds,
} from "../../operations-types.ts";

import {
  ADMISSION_REASON_KEY,
  ADMISSION_STATE_KEY,
  ADMISSION_UPDATED_KEY,
} from "../../operations-types.ts";

/**
 * Operations snapshot, ported to the async handle (FID-086, Batch B).
 *
 * The snapshot is what the rules read, and it must never invent health: a window
 * with no calls is `noTraffic`, a provider with no observation is `unknown`, and
 * a storage guard with no measurement is reported as zero rather than assumed
 * fine. Those distinctions are already in the shape; the port keeps them.
 *
 * Three translations were required:
 *
 * 1. `SUM(...)` and `MIN(...)` over `BIGINT`/counts arrive as strings and are
 *    coerced at this boundary, so the rules keep comparing numbers.
 * 2. `enabled = 1` and `quota_unlimited !== 1` stay valid because the flags are
 *    stored as integers on both engines; they are coerced anyway so a driver
 *    that returns booleans cannot silently flip a guard.
 * 3. Timestamps remain ISO-8601 text, so `MIN(created_at)` sorts correctly
 *    without a cast; only ordering that PostgreSQL might reinterpret gets
 *    `::timestamptz`.
 */

function ageSeconds(at: string | null, now: number): number | null {
  if (!at) return null;

  const parsed = Date.parse(at);

  if (!Number.isFinite(parsed)) return null;

  return Math.max(0, Math.floor((now - parsed) / 1000));
}

async function count(db: PostgresDatabase, sql: string, ...params: unknown[]) {
  const row = await db
    .prepare(sql)
    .get<{ total: number | string | null }>(...(params as []));

  return Number(row?.total ?? 0);
}

export async function readAdmissionControl(db: PostgresDatabase): Promise<{
  state: AdmissionState;
  reason: string | null;
  updatedAt: string | null;
}> {
  const rows = await db
    .prepare("SELECT key, value FROM settings WHERE key IN (?, ?, ?)")
    .all<{ key: string; value: string }>(
      ADMISSION_STATE_KEY,
      ADMISSION_REASON_KEY,
      ADMISSION_UPDATED_KEY,
    );
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const state = values.get(ADMISSION_STATE_KEY);
  const valid = state === "open" || state === "paused" || state === "draining";

  return {
    state: valid ? state : "open",
    reason: values.get(ADMISSION_REASON_KEY) || null,
    updatedAt: values.get(ADMISSION_UPDATED_KEY) || null,
  };
}

/**
 * Reads durable counters plus the operator's storage observation. It never
 * calls an upstream and never treats a missing timeline as an empty success.
 */
export async function readOperationsSnapshot(
  db: PostgresDatabase,
  input: {
    now?: string;
    thresholds: OperationsThresholds;
    storage: OperationsStorage;
  },
): Promise<OperationsSnapshot> {
  const generatedAt = input.now ?? new Date().toISOString();
  const now = Date.parse(generatedAt);
  const windowStart = new Date(
    now - input.thresholds.windowMinutes * 60_000,
  ).toISOString();

  const traffic = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status <> 'ok' THEN 1 ELSE 0 END) AS errors
         FROM usage_events
        WHERE created_at >= ?`,
    )
    .get<{ total: number | string; errors: number | string | null }>(
      windowStart,
    );
  const requests = Number(traffic?.total ?? 0);
  const errors = Number(traffic?.errors ?? 0);

  const settlementRows = await db
    .prepare(
      `SELECT status, COUNT(*) AS total, MIN(created_at) AS oldest
         FROM settlements GROUP BY status`,
    )
    .all<{ status: string; total: number | string; oldest: string | null }>();
  const settlement = (status: string) =>
    settlementRows.find((row) => row.status === status);
  const admittedRow = settlement("admitted");

  const paymentRows = await db
    .prepare(
      `SELECT status, COUNT(*) AS total, MIN(claimed_at) AS oldest
         FROM billing_events GROUP BY status`,
    )
    .all<{ status: string; total: number | string; oldest: string | null }>();
  const payment = (status: string) =>
    paymentRows.find((row) => row.status === status);
  const claimedRow = payment("claimed");

  const providers = await db
    .prepare(
      `SELECT slug, status, quota_unlimited, subscription_tokens_remaining,
              quota_observed_at, quota_error
         FROM providers WHERE enabled = 1 ORDER BY sort_order, label`,
    )
    .all<{
      slug: string;
      status: string;
      quota_unlimited: number | boolean;
      subscription_tokens_remaining: number | string | null;
      quota_observed_at: string | null;
      quota_error: string | null;
    }>();

  let current = 0;
  let stale = 0;
  let unknown = 0;
  let errored = 0;
  let oldestObservationAge: number | null = null;
  const lowReserve: OperationsSnapshot["quota"]["lowReserve"] = [];

  for (const provider of providers) {
    const observedAge = ageSeconds(provider.quota_observed_at, now);

    if (observedAge !== null) {
      oldestObservationAge =
        oldestObservationAge === null
          ? observedAge
          : Math.max(oldestObservationAge, observedAge);
    }

    if (provider.quota_error) {
      errored += 1;
    } else if (provider.quota_observed_at === null) {
      if (provider.status !== "unconfigured") unknown += 1;
    } else if (
      observedAge !== null &&
      observedAge > input.thresholds.quotaMaxAgeSeconds
    ) {
      stale += 1;
    } else {
      current += 1;
    }

    const remaining =
      provider.subscription_tokens_remaining === null
        ? null
        : Number(provider.subscription_tokens_remaining);

    if (
      input.thresholds.reserveMinTokens > 0 &&
      Number(provider.quota_unlimited) !== 1 &&
      remaining !== null &&
      remaining < input.thresholds.reserveMinTokens
    ) {
      lowReserve.push({ slug: provider.slug, remainingTokens: remaining });
    }
  }

  const heldMicros = await count(
    db,
    "SELECT SUM(hold_micros) AS total FROM credit_holds",
  );
  const quarantinedMicros = await count(
    db,
    "SELECT SUM(reserved) AS total FROM quarantined_holds WHERE status = 'quarantined'",
  );
  const customerCreditMicros = await count(
    db,
    "SELECT SUM(credit_micros) AS total FROM users",
  );

  return {
    generatedAt,
    windowMinutes: input.thresholds.windowMinutes,
    traffic: {
      requests,
      errors,
      errorRateBps:
        requests === 0 ? 0 : Math.round((errors * 10_000) / requests),
      noTraffic: requests === 0,
    },
    settlements: {
      admitted: Number(admittedRow?.total ?? 0),
      committed: Number(settlement("committed")?.total ?? 0),
      quarantined: Number(settlement("quarantined")?.total ?? 0),
      oldestUnresolvedAgeSeconds: ageSeconds(admittedRow?.oldest ?? null, now),
    },
    payments: {
      claimed: Number(claimedRow?.total ?? 0),
      failed: Number(payment("failed")?.total ?? 0),
      quarantined: Number(payment("quarantined")?.total ?? 0),
      oldestClaimedAgeSeconds: ageSeconds(claimedRow?.oldest ?? null, now),
    },
    quota: {
      enabledProviders: providers.length,
      current,
      stale,
      unknown,
      errored,
      oldestObservationAgeSeconds: oldestObservationAge,
      lowReserve,
    },
    money: { heldMicros, quarantinedMicros, customerCreditMicros },
    storage: input.storage,
    admission: await readAdmissionControl(db),
  };
}
