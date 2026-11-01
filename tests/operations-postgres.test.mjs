import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { evaluateOperations } from "../lib/operations-rules.ts";
import { readOperationsThresholds } from "../lib/operations-thresholds.ts";
import {
  acknowledgeIncident,
  listIncidents,
  readIncident,
  recordIncident,
  resolveIncident,
  resolveMissingIncidents,
} from "../lib/storage/operations/incidents.ts";
import { readOperationsSnapshot } from "../lib/storage/operations/snapshot.ts";
import { runOperationsTick } from "../lib/storage/operations/tick.ts";
import {
  getAdmissionControl,
  getOperationsSnapshot,
  runOperationsMonitor,
  setAdmissionState,
} from "../lib/storage/store/operations.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const T0 = "2026-10-31T12:00:00.000Z";
const T1 = "2026-10-31T12:01:00.000Z";

/**
 * The operations cluster on the target engine (FID-086, Batch B).
 *
 * The incident table is the audit trail an operator relies on at 3am, so the
 * suite pins the transitions rather than the rendering: one alert per open
 * condition, a new alert when a resolved condition returns, one escalation
 * warning → critical, and a delivery schedule that is bounded, resumable and
 * visible when it stops.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  return db;
}

function thresholds(overrides = {}) {
  return { ...readOperationsThresholds({}), ...overrides };
}

function snapshot(overrides = {}) {
  return {
    generatedAt: T0,
    windowMinutes: 60,
    traffic: { requests: 0, errors: 0, errorRateBps: 0, noTraffic: true },
    settlements: {
      admitted: 0,
      committed: 0,
      quarantined: 0,
      oldestUnresolvedAgeSeconds: null,
    },
    payments: {
      claimed: 0,
      failed: 0,
      quarantined: 0,
      oldestClaimedAgeSeconds: null,
    },
    quota: {
      enabledProviders: 0,
      current: 0,
      stale: 0,
      unknown: 0,
      errored: 0,
      oldestObservationAgeSeconds: null,
      lowReserve: [],
    },
    money: { heldMicros: 0, quarantinedMicros: 0, customerCreditMicros: 0 },
    storage: { databaseBytes: 0, backupCount: 1, backupAgeSeconds: 60 },
    admission: { state: "open", reason: null, updatedAt: null },
    ...overrides,
  };
}

const ERROR_RATE = {
  fingerprint: "traffic:error_rate",
  severity: "warning",
  title: "Gateway error rate is above the threshold",
  detail: "12 of 100 calls failed.",
};

test("an open condition alerts once and a repeat only refreshes it", async () => {
  const db = await fixture();

  try {
    const first = await recordIncident(db, ERROR_RATE, T0);

    assert.equal(first.opened, true);
    assert.equal(first.reopened, false);
    assert.equal(first.incident.status, "open");
    assert.equal(first.incident.deliveryState, "pending");
    assert.equal(first.incident.deliveryAttempts, 0);

    const again = await recordIncident(db, ERROR_RATE, T1);

    assert.equal(again.opened, false);
    assert.equal(again.incident.id, first.incident.id);
    assert.equal(again.incident.lastSeen, T1);
    assert.equal(again.incident.deliveryAttempts, 0);
    assert.equal((await listIncidents(db)).length, 1);
  } finally {
    await db.close();
  }
});

test("a resolved condition that returns is a new alert", async () => {
  const db = await fixture();

  try {
    const first = await recordIncident(db, ERROR_RATE, T0);

    await runOperationsTick({
      database: db,
      snapshot: snapshot({
        traffic: { requests: 100, errors: 12, errorRateBps: 1200, noTraffic: false },
      }),
      thresholds: thresholds(),
      transport: async () => ({ ok: true }),
      now: T0,
    });

    const delivered = await readIncident(db, first.incident.id);

    assert.equal(delivered.deliveryState, "delivered");
    assert.equal(delivered.deliveryAttempts, 1);

    const resolved = await resolveIncident(db, first.incident.id, T1);

    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.deliveryKind, "recovery");
    assert.equal(resolved.deliveryState, "pending");

    const reopened = await recordIncident(db, ERROR_RATE, T1);

    assert.equal(reopened.reopened, true);
    assert.equal(reopened.opened, false);
    assert.equal(reopened.incident.status, "open");
    assert.equal(reopened.incident.acknowledgedAt, null);
    assert.equal(
      reopened.incident.deliveryAttempts,
      0,
      "a returning condition gets a fresh alert budget",
    );
  } finally {
    await db.close();
  }
});

test("warning to critical queues one escalation and resets the budget", async () => {
  const db = await fixture();

  try {
    const first = await recordIncident(db, ERROR_RATE, T0);

    await runOperationsTick({
      database: db,
      snapshot: snapshot({
        traffic: { requests: 100, errors: 12, errorRateBps: 1200, noTraffic: false },
      }),
      thresholds: thresholds(),
      transport: async () => ({ ok: true }),
      now: T0,
    });

    const escalated = await recordIncident(
      db,
      { ...ERROR_RATE, severity: "critical" },
      T1,
    );

    assert.equal(escalated.incident.id, first.incident.id);
    assert.equal(escalated.incident.severity, "critical");
    assert.equal(escalated.incident.deliveryState, "pending");
    assert.equal(escalated.incident.deliveryAttempts, 0);

    const repeated = await recordIncident(
      db,
      { ...ERROR_RATE, severity: "critical" },
      T1,
    );

    assert.equal(repeated.incident.deliveryAttempts, 0);
    assert.equal(repeated.incident.deliveryState, "pending");
  } finally {
    await db.close();
  }
});

test("conditions that disappear are resolved, and acknowledgement is one-way", async () => {
  const db = await fixture();

  try {
    const one = await recordIncident(db, ERROR_RATE, T0);
    const two = await recordIncident(
      db,
      {
        fingerprint: "quota:stale",
        severity: "warning",
        title: "Provider quota observations are stale",
        detail: "1 provider",
      },
      T0,
    );

    const resolved = await resolveMissingIncidents(
      db,
      new Set([ERROR_RATE.fingerprint]),
      T1,
    );

    assert.equal(resolved, 1);
    assert.equal((await readIncident(db, one.incident.id)).status, "open");
    assert.equal((await readIncident(db, two.incident.id)).status, "resolved");

    const acknowledged = await acknowledgeIncident(db, one.incident.id, T1);

    assert.equal(acknowledged.acknowledgedAt, T1);
    assert.equal(await acknowledgeIncident(db, "missing", T1), null);
  } finally {
    await db.close();
  }
});

test("a failing webhook backs off, then stops and stays visible", async () => {
  const db = await fixture();
  const attempts = [];
  const failing = async (payload) => {
    attempts.push(payload.deliveryAttempt);

    return { ok: false, error: "connect ECONNREFUSED" };
  };
  const staleQuota = snapshot({
    quota: {
      enabledProviders: 1,
      current: 0,
      stale: 1,
      unknown: 0,
      errored: 0,
      oldestObservationAgeSeconds: 900,
      lowReserve: [],
    },
  });

  try {
    const first = await runOperationsTick({
      database: db,
      snapshot: staleQuota,
      thresholds: thresholds({ alertMaxAttempts: 2, alertRetrySeconds: 60 }),
      transport: failing,
      now: T0,
    });

    assert.equal(first.opened, 1);
    assert.equal(first.failed, 1);

    const [incident] = await listIncidents(db);

    assert.equal(incident.deliveryState, "failed");
    assert.equal(incident.deliveryAttempts, 1);
    assert.equal(incident.nextAttemptAt, "2026-10-31T12:01:00.000Z");
    assert.match(incident.lastDeliveryError, /ECONNREFUSED/);

    const early = await runOperationsTick({
      database: db,
      snapshot: staleQuota,
      thresholds: thresholds({ alertMaxAttempts: 2, alertRetrySeconds: 60 }),
      transport: failing,
      now: "2026-10-31T12:00:30.000Z",
    });

    assert.equal(early.failed, 0, "a retry before the backoff elapses is not due");
    assert.equal(attempts.length, 1);

    const second = await runOperationsTick({
      database: db,
      snapshot: staleQuota,
      thresholds: thresholds({ alertMaxAttempts: 2, alertRetrySeconds: 60 }),
      transport: failing,
      now: "2026-10-31T12:02:01.000Z",
    });

    assert.equal(second.failed, 1);

    const capped = await listIncidents(db);

    assert.equal(capped[0].deliveryAttempts, 2);
    assert.equal(capped[0].nextAttemptAt, null, "the retry budget is exhausted");
    assert.equal(capped[0].deliveryState, "failed");

    const later = await runOperationsTick({
      database: db,
      snapshot: staleQuota,
      thresholds: thresholds({ alertMaxAttempts: 2, alertRetrySeconds: 60 }),
      transport: failing,
      now: "2026-10-31T18:00:00.000Z",
    });

    assert.equal(later.failed, 0);
    assert.equal(attempts.length, 2);
  } finally {
    await db.close();
  }
});

test("an unconfigured transport records the incident and sends nothing", async () => {
  const db = await fixture();
  let sent = 0;

  try {
    const result = await runOperationsTick({
      database: db,
      snapshot: snapshot({
        quota: {
          enabledProviders: 1,
          current: 0,
          stale: 0,
          unknown: 1,
          errored: 0,
          oldestObservationAgeSeconds: null,
          lowReserve: [],
        },
      }),
      thresholds: thresholds(),
      transport: async () => {
        sent += 1;

        return {
          ok: false,
          unconfigured: true,
          error: "OPERATIONS_ALERT_WEBHOOK_URL is not configured.",
        };
      },
      now: T0,
    });

    assert.equal(result.unconfigured, 1);
    assert.equal(result.failed, 0);
    assert.equal(sent, 1);

    const [incident] = await listIncidents(db);

    assert.equal(incident.deliveryState, "unconfigured");
    assert.equal(incident.nextAttemptAt, null);
    assert.match(incident.lastDeliveryError, /OPERATIONS_ALERT_WEBHOOK_URL/);
  } finally {
    await db.close();
  }
});

test("the snapshot counts traffic, money and quota age without inventing health", async () => {
  const db = await fixture();

  try {
    await db
      .prepare(
        `INSERT INTO users (id, email, name, status, created_at, credit_micros)
         VALUES ('u1', 'u1@example.test', 'One', 'active', ?, 1234)`,
      )
      .run(T0);

    for (const [id, status, createdAt] of [
      ["ev1", "ok", T0],
      ["ev2", "error", T1],
      ["ev3", "ok", "2026-10-31T09:00:00.000Z"],
    ]) {
      await db
        .prepare(
          `INSERT INTO usage_events (id, status, created_at)
           VALUES (?, ?, ?)`,
        )
        .run(id, status, createdAt);
    }

    await db
      .prepare(
        `INSERT INTO settlements (id, user_id, api_key_id, model_id, provider_slug,
           billing_source, estimated_micros, status, created_at)
         VALUES ('set1', 'u1', 'k1', 'm1', 'savant', 'credit', 0, 'admitted',
                 '2026-10-31T11:45:00.000Z')`,
      )
      .run();
    await db
      .prepare(
        `INSERT INTO billing_events (id, type, processed_at, status, claimed_at)
         VALUES ('be1', 'topup', ?, 'claimed', '2026-10-31T11:30:00.000Z')`,
      )
      .run(T0);
    await db
      .prepare(
        `INSERT INTO credit_holds (id, user_id, api_key_id, model_id, hold_micros,
           created_at, expires_at)
         VALUES ('h1', 'u1', NULL, 'm1', 700, ?, ?)`,
      )
      .run(T0, T1);
    await db
      .prepare(
        `INSERT INTO quarantined_holds (id, kind, user_id, reserved, created_at,
           expired_at, status)
         VALUES ('q1', 'credit', 'u1', 300, ?, ?, 'quarantined')`,
      )
      .run(T0, T1);

    // The seeded registry ships enabled providers; this snapshot must observe
    // exactly the four rows below.
    await db.prepare("UPDATE providers SET enabled = 0").run();

    const providers = [
      ["prov_a", "active", 0, 500, T0, null],
      ["prov_b", "active", 0, 9_000, "2026-10-31T10:00:00.000Z", null],
      ["prov_c", "active", 0, null, null, null],
      ["prov_d", "error", 0, null, null, "upstream 401"],
    ];

    for (const [slug, status, unlimited, remaining, observedAt, error] of providers) {
      await db
        .prepare(
          `INSERT INTO providers
            (slug, label, base_url, key_env_var, status, enabled, sort_order,
             quota_unlimited, subscription_tokens_remaining, quota_observed_at,
             quota_error, created_at, updated_at)
           VALUES (?, ?, 'https://example.test', 'KEY', ?, 1, 0, ?, ?, ?, ?, ?, ?)`,
        )
        .run(slug, slug, status, unlimited, remaining, observedAt, error, T0, T0);
    }

    const result = await readOperationsSnapshot(db, {
      now: T0,
      thresholds: thresholds({ quotaMaxAgeSeconds: 120, reserveMinTokens: 1_000 }),
      storage: { databaseBytes: 10, backupCount: 1, backupAgeSeconds: 5 },
    });

    assert.equal(result.traffic.requests, 2, "the window excludes older traffic");
    assert.equal(result.traffic.errors, 1);
    assert.equal(result.traffic.errorRateBps, 5_000);
    assert.equal(result.traffic.noTraffic, false);
    assert.equal(result.settlements.admitted, 1);
    assert.equal(result.settlements.oldestUnresolvedAgeSeconds, 900);
    assert.equal(result.payments.claimed, 1);
    assert.equal(result.payments.oldestClaimedAgeSeconds, 1_800);
    assert.equal(result.quota.enabledProviders, 4);
    assert.equal(result.quota.current, 1);
    assert.equal(result.quota.stale, 1);
    assert.equal(result.quota.unknown, 1);
    assert.equal(result.quota.errored, 1);
    assert.deepEqual(result.quota.lowReserve, [
      { slug: "prov_a", remainingTokens: 500 },
    ]);
    assert.equal(result.money.heldMicros, 700);
    assert.equal(result.money.quarantinedMicros, 300);
    assert.equal(result.money.customerCreditMicros, 1_234);

    const candidates = evaluateOperations(result, thresholds()).map(
      (candidate) => candidate.fingerprint,
    );

    assert.ok(candidates.includes("settlement:unresolved"));
    assert.ok(candidates.includes("payment:stale_claim"));
    assert.ok(candidates.includes("quota:stale"));
    assert.ok(candidates.includes("quota:unknown"));
    assert.ok(candidates.includes("quota:error"));
    assert.ok(candidates.includes("reserve:low:prov_a"));
  } finally {
    await db.close();
  }
});

test("admission control refuses an unexplained pause and persists atomically", async () => {
  const db = await fixture();

  try {
    assert.deepEqual(await getAdmissionControl(db), {
      state: "open",
      reason: null,
      updatedAt: null,
    });

    const refused = await setAdmissionState(db, { state: "paused", reason: "  " });

    assert.equal(refused.ok, false);
    assert.match(refused.error, /reason is required/i);
    assert.equal((await getAdmissionControl(db)).state, "open");

    const invalid = await setAdmissionState(db, { state: "closed" });

    assert.equal(invalid.ok, false);

    const paused = await setAdmissionState(db, {
      state: "paused",
      reason: "  upstream outage  ",
    });

    assert.equal(paused.ok, true);
    assert.equal(paused.control.state, "paused");
    assert.equal(paused.control.reason, "upstream outage");
    assert.ok(paused.control.updatedAt);
  } finally {
    await db.close();
  }
});

test("the store monitor observes the volume and records what it cannot deliver", async () => {
  const db = await fixture();
  const previousBackupDir = process.env.BACKUP_DIR;
  const previousWebhook = process.env.OPERATIONS_ALERT_WEBHOOK_URL;

  process.env.BACKUP_DIR = join(tmpdir(), "savant-no-such-backup-directory");
  delete process.env.OPERATIONS_ALERT_WEBHOOK_URL;

  try {
    // The seeded catalog already owns `savant`; disable everything so this run
    // observes exactly one provider with no quota observation.
    await db.prepare("UPDATE providers SET enabled = 0").run();
    await db
      .prepare(
        `INSERT INTO providers
          (slug, label, base_url, key_env_var, status, enabled, sort_order,
           created_at, updated_at)
         VALUES ('monitor_test', 'Monitor', 'https://example.test', 'KEY',
                 'active', 1, 0, ?, ?)`,
      )
      .run(T0, T0);

    const observed = await getOperationsSnapshot(db);

    assert.ok(observed.storage.databaseBytes >= 0);
    assert.equal(observed.storage.backupCount, 0);
    assert.equal(observed.storage.backupAgeSeconds, null);
    assert.equal(observed.quota.unknown, 1);

    const result = await runOperationsMonitor(db);

    assert.equal(result.opened, 1);
    assert.equal(result.unconfigured, 1);

    const [incident] = await listIncidents(db);

    assert.equal(incident.fingerprint, "quota:unknown");
    assert.equal(incident.deliveryState, "unconfigured");
  } finally {
    process.env.BACKUP_DIR = previousBackupDir;
    process.env.OPERATIONS_ALERT_WEBHOOK_URL = previousWebhook;

    if (previousBackupDir === undefined) delete process.env.BACKUP_DIR;
    if (previousWebhook === undefined) delete process.env.OPERATIONS_ALERT_WEBHOOK_URL;

    await db.close();
  }
});
