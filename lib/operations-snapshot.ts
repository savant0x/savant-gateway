import type { DatabaseHandle } from "./schema/columns.ts";
import type {
  AdmissionState,
  OperationsSnapshot,
  OperationsStorage,
  OperationsThresholds,
} from "./operations-types.ts";

import {
  ADMISSION_REASON_KEY,
  ADMISSION_STATE_KEY,
  ADMISSION_UPDATED_KEY,
} from "./operations-types.ts";

function ageSeconds(at: string | null, now: number): number | null {
  if (!at) return null;

  const parsed = Date.parse(at);

  if (!Number.isFinite(parsed)) return null;

  return Math.max(0, Math.floor((now - parsed) / 1000));
}

function count(database: DatabaseHandle, sql: string, ...params: unknown[]) {
  const row = database.prepare(sql).get(...params) as
    { total: number | null } | undefined;

  return Number(row?.total ?? 0);
}

export function readAdmissionControl(database: DatabaseHandle): {
  state: AdmissionState;
  reason: string | null;
  updatedAt: string | null;
} {
  const rows = database
    .prepare("SELECT key, value FROM settings WHERE key IN (?, ?, ?)")
    .all(
      ADMISSION_STATE_KEY,
      ADMISSION_REASON_KEY,
      ADMISSION_UPDATED_KEY,
    ) as Array<{ key: string; value: string }>;
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
 * calls an upstream or treats a missing timeline as an empty success: a window
 * with no calls is reported as `noTraffic` and rendered as such.
 */
export function readOperationsSnapshot(
  database: DatabaseHandle,
  input: {
    now?: string;
    thresholds: OperationsThresholds;
    storage: OperationsStorage;
  },
): OperationsSnapshot {
  const generatedAt = input.now ?? new Date().toISOString();
  const now = Date.parse(generatedAt);
  const windowStart = new Date(
    now - input.thresholds.windowMinutes * 60_000,
  ).toISOString();

  const traffic = database
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status <> 'ok' THEN 1 ELSE 0 END) AS errors
       FROM usage_events
       WHERE created_at >= ?`,
    )
    .get(windowStart) as { total: number; errors: number | null };
  const requests = Number(traffic.total);
  const errors = Number(traffic.errors ?? 0);

  const settlementRows = database
    .prepare(
      `SELECT status, COUNT(*) AS total, MIN(created_at) AS oldest
       FROM settlements GROUP BY status`,
    )
    .all() as Array<{ status: string; total: number; oldest: string | null }>;
  const settlement = (status: string) =>
    settlementRows.find((row) => row.status === status);
  const admittedRow = settlement("admitted");

  const paymentRows = database
    .prepare(
      `SELECT status, COUNT(*) AS total, MIN(claimed_at) AS oldest
       FROM billing_events GROUP BY status`,
    )
    .all() as Array<{ status: string; total: number; oldest: string | null }>;
  const payment = (status: string) =>
    paymentRows.find((row) => row.status === status);
  const claimedRow = payment("claimed");

  const providers = database
    .prepare(
      `SELECT slug, status, quota_unlimited, subscription_tokens_remaining,
              quota_observed_at, quota_error
       FROM providers WHERE enabled = 1 ORDER BY sort_order, label`,
    )
    .all() as Array<{
    slug: string;
    status: string;
    quota_unlimited: number;
    subscription_tokens_remaining: number | null;
    quota_observed_at: string | null;
    quota_error: string | null;
  }>;

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

    if (
      input.thresholds.reserveMinTokens > 0 &&
      provider.quota_unlimited !== 1 &&
      provider.subscription_tokens_remaining !== null &&
      provider.subscription_tokens_remaining < input.thresholds.reserveMinTokens
    ) {
      lowReserve.push({
        slug: provider.slug,
        remainingTokens: provider.subscription_tokens_remaining,
      });
    }
  }

  const heldMicros = count(
    database,
    "SELECT SUM(hold_micros) AS total FROM credit_holds",
  );
  const quarantinedMicros = count(
    database,
    "SELECT SUM(reserved) AS total FROM quarantined_holds WHERE status = 'quarantined'",
  );
  const customerCreditMicros = count(
    database,
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
    admission: readAdmissionControl(database),
  };
}
