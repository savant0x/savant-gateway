import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import Database from "better-sqlite3";

import {
  acknowledgeIncident,
  evaluateOperations,
  listIncidents,
  readIncident,
  readOperationsSnapshot,
  readOperationsThresholds,
  recordIncident,
  resolveIncident,
  resolveMissingIncidents,
  runOperationsTick,
} from "../lib/operations.ts";
import {
  deliverAlert,
  readAlertTransportConfig,
  signAlertBody,
} from "../lib/alert-transport.ts";
import { operationsSchema } from "../lib/schema/operations.ts";

const T0 = "2026-10-31T12:00:00.000Z";
const T0_MS = Date.parse(T0);

function createDatabase() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      credit_micros INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE providers (
      slug TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      sort_order INTEGER NOT NULL DEFAULT 0,
      quota_unlimited INTEGER NOT NULL DEFAULT 0,
      subscription_tokens_remaining INTEGER,
      quota_observed_at TEXT,
      quota_error TEXT
    );
    CREATE TABLE usage_events (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE settlements (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE billing_events (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      claimed_at TEXT
    );
    CREATE TABLE credit_holds (
      id TEXT PRIMARY KEY,
      hold_micros INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE quarantined_holds (
      id TEXT PRIMARY KEY,
      reserved INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL
    );
  `);
  operationsSchema(db);

  return db;
}

function thresholds(overrides = {}) {
  return {
    ...readOperationsThresholds({}),
    alertRetrySeconds: 60,
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    generatedAt: T0,
    windowMinutes: 60,
    traffic: {
      requests: 0,
      errors: 0,
      errorRateBps: 0,
      noTraffic: true,
    },
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
    money: {
      heldMicros: 0,
      quarantinedMicros: 0,
      customerCreditMicros: 0,
    },
    storage: { databaseBytes: 0, backupCount: 0, backupAgeSeconds: null },
    admission: { state: "open", reason: null, updatedAt: null },
    ...overrides,
  };
}

test("threshold parsing falls back from malformed values instead of disabling guards", () => {
  const defaults = readOperationsThresholds({});
  const malformed = readOperationsThresholds({
    OPERATIONS_MIN_REQUESTS: "not-a-number",
    OPERATIONS_ERROR_RATE_BPS: "-1",
    OPERATIONS_QUOTA_MAX_AGE_SECONDS: "too-old",
  });

  assert.equal(malformed.minRequests, defaults.minRequests);
  assert.equal(malformed.errorRateBps, defaults.errorRateBps);
  assert.equal(malformed.quotaMaxAgeSeconds, defaults.quotaMaxAgeSeconds);
  assert.equal(
    readOperationsThresholds({ OPERATIONS_ERROR_RATE_BPS: "2500" }).errorRateBps,
    2500,
  );
});

test("snapshot reports no traffic separately and reads durable state", () => {
  const db = createDatabase();
  const recent = new Date(T0_MS - 60_000).toISOString();
  const old = new Date(T0_MS - 30 * 60_000).toISOString();
  const outside = new Date(T0_MS - 2 * 60 * 60_000).toISOString();

  db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?), (?, ?, ?)",
  ).run(
    "operations.admission_state",
    "paused",
    T0,
    "operations.admission_reason",
    "Provider maintenance",
    T0,
  );
  db.prepare(
    `INSERT INTO usage_events (id, status, created_at)
     VALUES ('u1', 'ok', ?), ('u2', 'error', ?), ('u3', 'ok', ?), ('u4', 'ok', ?)`,
  ).run(recent, recent, recent, outside);
  db.prepare(
    `INSERT INTO settlements (id, status, created_at)
     VALUES ('s1', 'admitted', ?), ('s2', 'committed', ?), ('s3', 'quarantined', ?)`,
  ).run(old, recent, recent);
  db.prepare(
    `INSERT INTO billing_events (id, status, claimed_at)
     VALUES ('b1', 'failed', ?), ('b2', 'claimed', ?), ('b3', 'processed', ?)`,
  ).run(old, old, recent);
  db.prepare(
    `INSERT INTO providers
      (slug, label, enabled, status, quota_unlimited, subscription_tokens_remaining,
       quota_observed_at, quota_error)
     VALUES
      ('alpha', 'Alpha', 1, 'active', 0, 50, ?, NULL),
      ('stale', 'Stale', 1, 'active', 0, 500, ?, NULL),
      ('unknown', 'Unknown', 1, 'active', 0, NULL, NULL, NULL),
      ('unconfigured', 'Unconfigured', 1, 'unconfigured', 0, NULL, NULL, NULL),
      ('broken', 'Broken', 1, 'active', 0, NULL, NULL, 'quota fetch failed'),
      ('off', 'Off', 0, 'active', 0, 10, ?, NULL)`,
  ).run(recent, old, recent);
  db.prepare("INSERT INTO credit_holds (id, hold_micros) VALUES ('h1', 400)").run();
  db.prepare(
    "INSERT INTO quarantined_holds (id, reserved, status) VALUES ('q1', 250, 'quarantined')",
  ).run();
  db.prepare("INSERT INTO users (id, credit_micros) VALUES ('u', 900)").run();

  const result = readOperationsSnapshot(db, {
    now: T0,
    thresholds: thresholds({ reserveMinTokens: 100, quotaMaxAgeSeconds: 120 }),
    storage: { databaseBytes: 4096, backupCount: 0, backupAgeSeconds: null },
  });

  assert.equal(result.traffic.requests, 3);
  assert.equal(result.traffic.errors, 1);
  assert.equal(result.traffic.errorRateBps, 3333);
  assert.equal(result.traffic.noTraffic, false);
  assert.equal(result.settlements.admitted, 1);
  assert.equal(result.settlements.committed, 1);
  assert.equal(result.settlements.oldestUnresolvedAgeSeconds, 1800);
  assert.equal(result.payments.failed, 1);
  assert.equal(result.payments.claimed, 1);
  assert.equal(result.payments.oldestClaimedAgeSeconds, 1800);
  assert.equal(result.quota.enabledProviders, 5);
  assert.equal(result.quota.current, 1);
  assert.equal(result.quota.stale, 1);
  assert.equal(result.quota.unknown, 1);
  assert.equal(result.quota.errored, 1);
  assert.deepEqual(result.quota.lowReserve, [
    { slug: "alpha", remainingTokens: 50 },
  ]);
  assert.equal(result.money.heldMicros, 400);
  assert.equal(result.money.quarantinedMicros, 250);
  assert.equal(result.money.customerCreditMicros, 900);
  assert.equal(result.admission.state, "paused");
  assert.equal(result.admission.reason, "Provider maintenance");

  const empty = readOperationsSnapshot(createDatabase(), {
    now: T0,
    thresholds: thresholds(),
    storage: { databaseBytes: 0, backupCount: 0, backupAgeSeconds: null },
  });

  assert.equal(empty.traffic.noTraffic, true);
  assert.equal(empty.traffic.errorRateBps, 0);
  assert.equal(empty.admission.state, "open");
});

test("rule evaluation distinguishes quiet traffic from healthy uptime", () => {
  const rules = evaluateOperations(
    snapshot({
      traffic: {
        requests: 10,
        errors: 9,
        errorRateBps: 9000,
        noTraffic: false,
      },
    }),
    thresholds({ minRequests: 20 }),
  );

  assert.equal(rules.length, 0);

  const active = evaluateOperations(
    snapshot({
      traffic: {
        requests: 100,
        errors: 12,
        errorRateBps: 1200,
        noTraffic: false,
      },
    }),
    thresholds({ minRequests: 20, errorRateBps: 1000 }),
  );

  assert.equal(active[0].fingerprint, "traffic:error_rate");
  assert.equal(active[0].severity, "warning");

  const critical = evaluateOperations(
    snapshot({
      traffic: {
        requests: 100,
        errors: 30,
        errorRateBps: 3000,
        noTraffic: false,
      },
    }),
    thresholds({ minRequests: 20, errorRateBps: 1000 }),
  );

  assert.equal(critical[0].severity, "critical");
});

test("rule evaluation covers settlements, payments, quota and storage", () => {
  const rules = evaluateOperations(
    snapshot({
      settlements: {
        admitted: 2,
        committed: 1,
        quarantined: 1,
        oldestUnresolvedAgeSeconds: 1800,
      },
      payments: {
        claimed: 1,
        failed: 2,
        quarantined: 1,
        oldestClaimedAgeSeconds: 3600,
      },
      quota: {
        enabledProviders: 3,
        current: 0,
        stale: 1,
        unknown: 1,
        errored: 1,
        oldestObservationAgeSeconds: 3600,
        lowReserve: [{ slug: "alpha", remainingTokens: 10 }],
      },
      storage: { databaseBytes: 2048, backupCount: 0, backupAgeSeconds: null },
    }),
    thresholds({
      settlementMaxAgeSeconds: 900,
      paymentMaxAgeSeconds: 1800,
      reserveMinTokens: 100,
      databaseMaxBytes: 1024,
      backupMaxAgeSeconds: 3600,
    }),
  );
  const fingerprints = rules.map((rule) => rule.fingerprint);

  assert.deepEqual(
    [...new Set(fingerprints)].sort(),
    [
      "payment:failed",
      "payment:stale_claim",
      "quota:error",
      "quota:stale",
      "quota:unknown",
      "reserve:low:alpha",
      "settlement:unresolved",
      "storage:backup_stale",
      "storage:database_size",
    ],
  );
  assert.equal(
    rules.find((rule) => rule.fingerprint === "settlement:unresolved").severity,
    "critical",
  );
});

test("incident fingerprints deduplicate and a resolution reopens deliberately", () => {
  const db = createDatabase();
  const candidate = {
    fingerprint: "payment:failed",
    severity: "warning",
    title: "Payment events need operator attention",
    detail: "Two failed events.",
  };
  const first = recordIncident(db, candidate, T0);

  assert.equal(first.opened, true);
  assert.equal(first.reopened, false);

  const second = recordIncident(
    db,
    { ...candidate, detail: "Still two failed events." },
    "2026-10-31T12:05:00.000Z",
  );

  assert.equal(second.opened, false);
  assert.equal(second.incident.id, first.incident.id);
  assert.equal(second.incident.lastSeen, "2026-10-31T12:05:00.000Z");
  assert.equal(listIncidents(db).length, 1);

  const resolved = resolveIncident(db, first.incident.id, T0);

  assert.equal(resolved?.status, "resolved");
  assert.equal(resolved?.deliveryKind, "recovery");
  assert.equal(resolved?.deliveryState, "pending");

  const reopened = recordIncident(db, candidate, "2026-10-31T12:10:00.000Z");

  assert.equal(reopened.reopened, true);
  assert.equal(reopened.incident.status, "open");
  assert.equal(reopened.incident.firstSeen, T0);
  assert.equal(reopened.incident.deliveryKind, "alert");

  const acknowledged = acknowledgeIncident(db, first.incident.id, T0);

  assert.equal(acknowledged?.acknowledgedAt, T0);
  assert.equal(acknowledgeIncident(db, "missing", T0), null);
});

test("missing fingerprints are resolved and stale rows stay visible", () => {
  const db = createDatabase();

  recordIncident(db, {
    fingerprint: "quota:stale",
    severity: "warning",
    title: "Stale quota",
    detail: "One provider.",
  }, T0);
  recordIncident(db, {
    fingerprint: "payment:failed",
    severity: "critical",
    title: "Payments",
    detail: "One event.",
  }, T0);

  const resolved = resolveMissingIncidents(
    db,
    new Set(["payment:failed"]),
    "2026-10-31T12:05:00.000Z",
  );

  assert.equal(resolved, 1);
  assert.equal(readIncident(db, listIncidents(db)[0].id)?.status, "open");
  assert.equal(
    listIncidents(db).find((incident) => incident.fingerprint === "quota:stale")
      ?.status,
    "resolved",
  );
});

test("a tick opens one incident, delivers once and sends one recovery", async () => {
  const db = createDatabase();
  const sent = [];
  const transport = async (payload) => {
    sent.push(payload);

    return { ok: true };
  };

  const failed = snapshot({
    payments: {
      claimed: 0,
      failed: 1,
      quarantined: 0,
      oldestClaimedAgeSeconds: null,
    },
  });
  const first = await runOperationsTick({
    database: db,
    snapshot: failed,
    thresholds: thresholds(),
    transport,
    now: T0,
  });

  assert.equal(first.opened, 1);
  assert.equal(first.delivered, 1);
  assert.equal(sent[0].event, "alert");
  assert.equal(listIncidents(db)[0].deliveryState, "delivered");

  const second = await runOperationsTick({
    database: db,
    snapshot: failed,
    thresholds: thresholds(),
    transport,
    now: T0,
  });

  assert.equal(second.opened, 0);
  assert.equal(second.delivered, 0);
  assert.equal(sent.length, 1);

  const clean = snapshot({ generatedAt: "2026-10-31T12:06:00.000Z" });
  const recovery = await runOperationsTick({
    database: db,
    snapshot: clean,
    thresholds: thresholds(),
    transport,
    now: "2026-10-31T12:06:00.000Z",
  });

  assert.equal(recovery.resolved, 1);
  assert.equal(recovery.delivered, 1);
  assert.equal(sent[1].event, "recovery");
  assert.equal(sent[1].status, "resolved");
  assert.equal(listIncidents(db)[0].status, "resolved");
  assert.equal(listIncidents(db)[0].deliveryKind, "recovery");
});

test("delivery failures retry with backoff and stop at the attempt ceiling", async () => {
  const db = createDatabase();
  let calls = 0;
  const transport = async () => {
    calls += 1;

    return { ok: false, error: "Webhook returned HTTP 500" };
  };
  const active = snapshot({
    payments: {
      claimed: 0,
      failed: 1,
      quarantined: 0,
      oldestClaimedAgeSeconds: null,
    },
  });
  const first = await runOperationsTick({
    database: db,
    snapshot: active,
    thresholds: thresholds({ alertMaxAttempts: 3 }),
    transport,
    now: T0,
  });

  assert.equal(first.failed, 1);
  assert.equal(listIncidents(db)[0].deliveryAttempts, 1);
  assert.equal(
    listIncidents(db)[0].nextAttemptAt,
    "2026-10-31T12:01:00.000Z",
  );

  const tooSoon = await runOperationsTick({
    database: db,
    snapshot: { ...active, generatedAt: "2026-10-31T12:00:30.000Z" },
    thresholds: thresholds({ alertMaxAttempts: 3 }),
    transport,
    now: "2026-10-31T12:00:30.000Z",
  });

  assert.equal(tooSoon.failed, 0);
  assert.equal(calls, 1);

  await runOperationsTick({
    database: db,
    snapshot: { ...active, generatedAt: "2026-10-31T12:01:00.000Z" },
    thresholds: thresholds({ alertMaxAttempts: 3 }),
    transport,
    now: "2026-10-31T12:01:00.000Z",
  });
  await runOperationsTick({
    database: db,
    snapshot: { ...active, generatedAt: "2026-10-31T12:03:00.000Z" },
    thresholds: thresholds({ alertMaxAttempts: 3 }),
    transport,
    now: "2026-10-31T12:03:00.000Z",
  });

  const final = listIncidents(db)[0];

  assert.equal(calls, 3);
  assert.equal(final.deliveryAttempts, 3);
  assert.equal(final.deliveryState, "failed");
  assert.equal(final.nextAttemptAt, null);

  const afterCeiling = await runOperationsTick({
    database: db,
    snapshot: { ...active, generatedAt: "2026-10-31T13:00:00.000Z" },
    thresholds: thresholds({ alertMaxAttempts: 3 }),
    transport,
    now: "2026-10-31T13:00:00.000Z",
  });

  assert.equal(afterCeiling.failed, 0);
  assert.equal(calls, 3);
});

test("unconfigured delivery is recorded without sending or burning attempts", async () => {
  const db = createDatabase();
  let calls = 0;
  const transport = async () => {
    calls += 1;

    return { ok: false, unconfigured: true, error: "URL is not configured" };
  };
  const result = await runOperationsTick({
    database: db,
    snapshot: snapshot({
      payments: {
        claimed: 0,
        failed: 1,
        quarantined: 0,
        oldestClaimedAgeSeconds: null,
      },
    }),
    thresholds: thresholds(),
    transport,
    now: T0,
  });

  assert.equal(result.unconfigured, 1);
  assert.equal(calls, 1);
  assert.equal(listIncidents(db)[0].deliveryState, "unconfigured");
  assert.equal(listIncidents(db)[0].deliveryAttempts, 0);
  assert.equal(listIncidents(db)[0].nextAttemptAt, null);
});

test("transport config refuses insecure destinations and short secrets", () => {
  assert.equal(readAlertTransportConfig({}).configured, false);
  assert.equal(
    readAlertTransportConfig({
      OPERATIONS_ALERT_WEBHOOK_URL: "http://alerts.example.test/hook",
    }).configured,
    false,
  );
  assert.equal(
    readAlertTransportConfig({
      OPERATIONS_ALERT_WEBHOOK_URL: "http://127.0.0.1:9000/hook",
      GATEWAY_DISPOSABLE_START: "yes",
    }).configured,
    true,
  );
  assert.equal(
    readAlertTransportConfig({
      OPERATIONS_ALERT_WEBHOOK_URL: "https://alerts.example.test/hook",
      NODE_ENV: "production",
      OPERATIONS_ALERT_WEBHOOK_SECRET: "too-short",
    }).configured,
    false,
  );
  assert.equal(
    readAlertTransportConfig({
      OPERATIONS_ALERT_WEBHOOK_URL: "https://alerts.example.test/hook",
      NODE_ENV: "production",
      OPERATIONS_ALERT_WEBHOOK_SECRET: "0123456789abcdef",
    }).configured,
    true,
  );
});

test("webhook delivery signs the body and keeps the URL out of stored errors", async () => {
  const received = [];
  const server = createServer((request, response) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      received.push({ body, signature: request.headers["x-savant-signature"] });
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ok");
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/hook`;

  try {
    const secret = "0123456789abcdef";
    const payload = {
      id: "inc_1",
      fingerprint: "payment:failed",
      event: "alert",
      severity: "critical",
      status: "open",
      title: "Payment events need operator attention",
      detail: "One event.",
      firstSeen: T0,
      lastSeen: T0,
      deliveryAttempt: 1,
      at: T0,
    };
    const delivered = await deliverAlert(
      payload,
      { configured: true, url, secret, timeoutMs: 1000 },
      {},
    );

    assert.equal(delivered.ok, true);
    assert.equal(received.length, 1);
    assert.equal(received[0].signature, `sha256=${signAlertBody(secret, received[0].body)}`);
    assert.equal(JSON.parse(received[0].body).fingerprint, "payment:failed");

    const unconfigured = await deliverAlert(
      payload,
      { configured: false, problem: "not configured" },
      {},
    );

    assert.equal(unconfigured.ok, false);
    assert.equal(unconfigured.unconfigured, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a failed delivery records a redacted error rather than the webhook URL", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end("upstream failed");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/secret-token`;

  try {
    const result = await deliverAlert(
      {
        id: "inc_1",
        fingerprint: "payment:failed",
        event: "alert",
        severity: "critical",
        status: "open",
        title: "Payment events need operator attention",
        detail: "One event.",
        firstSeen: T0,
        lastSeen: T0,
        deliveryAttempt: 1,
        at: T0,
      },
      { configured: true, url, secret: null, timeoutMs: 1000 },
      {},
    );

    assert.equal(result.ok, false);
    assert.match(result.error, /HTTP 500/);
    assert.equal(result.error.includes(url), false);
    assert.equal(result.error.includes("secret-token"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
