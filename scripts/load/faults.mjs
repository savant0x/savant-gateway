import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { request } from "../http-suite/harness.mjs";
import { jsonCall, openStream, waitFor } from "./client.mjs";
import { counts } from "./offered.mjs";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const PAID = "load-paid";

function latestUsage(database, userId) {
  return database
    .prepare(
      `SELECT status, charged_micros, billing_source, error
       FROM usage_events WHERE user_id = ?
       ORDER BY rowid DESC LIMIT 1`,
    )
    .get(userId);
}

function resetInference(mock) {
  mock.state.inference.delayMs = 0;
  mock.state.inference.failure = null;
  mock.state.inference.streamFrames = null;
  mock.state.inference.streamFrameDelayMs = 5;
  mock.state.inference.truncatedStream = false;
}

export async function runFaultMatrix(context) {
  const { mock, database, fixture } = context;
  const repeats = context.envelope.workloads.faults.repeats;
  const cases = [
    {
      name: "provider-429",
      expectedStatus: 429,
      expectedUsage: "error",
      setup: () => {
        mock.state.inference.failure = "429";
      },
      call: () =>
        jsonCall(context.baseUrl, fixture.paid.secret, {
          model: PAID,
          content: "fault 429",
        }),
    },
    {
      name: "provider-500",
      expectedStatus: 502,
      expectedUsage: "error",
      setup: () => {
        mock.state.inference.failure = "500";
      },
      call: () =>
        jsonCall(context.baseUrl, fixture.paid.secret, {
          model: PAID,
          content: "fault 500",
        }),
    },
    {
      name: "malformed-json",
      expectedStatus: 502,
      expectedUsage: "error",
      setup: () => {
        mock.state.inference.failure = "malformed";
      },
      call: () =>
        jsonCall(context.baseUrl, fixture.paid.secret, {
          model: PAID,
          content: "fault malformed",
        }),
    },
    {
      name: "provider-disconnect",
      expectedStatus: 502,
      expectedUsage: "error",
      setup: () => {
        mock.state.inference.failure = "disconnect";
      },
      call: () =>
        jsonCall(context.baseUrl, fixture.paid.secret, {
          model: PAID,
          content: "fault disconnect",
        }),
    },
    {
      name: "provider-slow",
      expectedStatus: 200,
      expectedUsage: "ok",
      setup: () => {
        mock.state.inference.delayMs = 250;
      },
      call: () =>
        jsonCall(context.baseUrl, fixture.paid.secret, {
          model: PAID,
          content: "fault slow",
        }),
      minimumLatencyMs: 200,
    },
    {
      name: "truncated-stream",
      expectedStatus: 200,
      expectedUsage: "error",
      expectedCompleted: false,
      allowCharge: true,
      setup: () => {
        mock.state.inference.streamFrames = 3;
        mock.state.inference.streamFrameDelayMs = 5;
        mock.state.inference.truncatedStream = true;
      },
      call: async () => {
        const stream = openStream(context.baseUrl, fixture.paid.secret, {
          model: PAID,
          content: "fault truncated",
          timeoutMs: 5_000,
        });

        await stream.started;

        return stream.done;
      },
    },
  ];
  const results = [];

  try {
    for (const fault of cases) {
      for (let attempt = 1; attempt <= repeats; attempt += 1) {
        const before = counts(database);
        const mockBefore = mock.state.calls;

        resetInference(mock);
        fault.setup();

        let observation;

        try {
          observation = await fault.call();
        } finally {
          resetInference(mock);
        }

        const dispatched = mock.state.calls - mockBefore;
        const settled = await waitFor(
          () => {
            const current = counts(database);

            return (
              current.usage - before.usage >= 1 &&
              current.committed + current.quarantined - before.committed -
                before.quarantined >=
                1
            );
          },
          { timeoutMs: 8_000 },
        );
        const usage = latestUsage(database, fixture.paid.userId);

        results.push({
          name: fault.name,
          attempt,
          status: observation.status,
          expectedStatus: fault.expectedStatus,
          statusOk: observation.status === fault.expectedStatus,
          dispatched,
          settled: Boolean(settled),
          usageStatus: usage?.status ?? null,
          usageOk: usage?.status === fault.expectedUsage,
          chargedMicros: usage?.charged_micros ?? null,
          noCharge: usage?.charged_micros === 0,
          chargeOk:
            fault.allowCharge === true || usage?.charged_micros === 0,
          completed: observation.completed ?? null,
          transportError: observation.transportError ?? null,
          latencyMs: Math.round(observation.latencyMs ?? 0),
          latencyOk:
            fault.minimumLatencyMs === undefined ||
            (observation.latencyMs ?? 0) >= fault.minimumLatencyMs,
          completedOk:
            fault.expectedCompleted === undefined ||
            observation.completed === fault.expectedCompleted,
        });
      }
    }

    return results;
  } finally {
    resetInference(mock);
  }
}

export async function runQuotaReset(context) {
  const { mock, database, fixture, adminCookie } = context;
  const tomorrow = new Date();

  tomorrow.setUTCHours(24, 0, 0, 0);
  mock.state.quota.unlimited = false;
  mock.state.quota.token_limit = 20_000_000;
  mock.state.quota.tokens_used = 0;
  mock.state.quota.tokens_remaining = 20_000_000;
  mock.state.quota.allowed = true;
  mock.state.quota.resets_at_utc = tomorrow.toISOString();

  const runtime = () =>
    request(context.baseUrl, "/api/provider/runtime?slug=load", {
      cookie: adminCookie,
    });
  const current = await runtime();

  mock.state.quota.resets_at_utc = new Date(Date.now() - 1_000).toISOString();
  const expired = await runtime();
  mock.state.quota.resets_at_utc = tomorrow.toISOString();
  const recovered = await runtime();
  const freeCall = await jsonCall(context.baseUrl, fixture.free.secret, {
    model: "load-free",
    content: "quota reset probe",
    maxTokens: 8,
  });
  const usage = latestUsage(database, fixture.free.userId);

  return {
    label: "quota-reset",
    currentStatus: current.status,
    expiredStatus: expired.status,
    recoveredStatus: recovered.status,
    freeCallStatus: freeCall.status,
    freeBillingSource: usage?.billing_source ?? null,
    freeChargedMicros: usage?.charged_micros ?? null,
    honest:
      current.status === 200 &&
      expired.status === 503 &&
      recovered.status === 200 &&
      freeCall.status === 200 &&
      usage?.billing_source === "free" &&
      usage?.charged_micros === 0,
  };
}

export async function runDatabaseContention(context) {
  const database = new Database(context.dbPath);

  database.pragma("busy_timeout = 2000");

  let release;
  const released = new Promise((resolve) => {
    release = resolve;
  });
  database.exec("BEGIN IMMEDIATE");
  const timer = setTimeout(() => {
    try {
      database.exec("COMMIT");
    } catch {
      // The request path reports its own failure; the finally block releases.
    }

    release();
  }, 250);

  try {
    const before = counts(context.database);
    const call = await jsonCall(context.baseUrl, context.fixture.paid.secret, {
      model: PAID,
      content: "contention probe",
    });

    await released;

    const settled = await waitFor(
      () => {
        const current = counts(context.database);

        return (
          current.usage - before.usage >= 1 &&
          current.committed - before.committed >= 1
        );
      },
      { timeoutMs: 8_000 },
    );

    return {
      label: "database-contention",
      status: call.status,
      latencyMs: Math.round(call.latencyMs),
      waitedForWriter: call.latencyMs >= 200,
      settled: Boolean(settled),
      honest: call.status === 200 && call.latencyMs >= 200 && Boolean(settled),
    };
  } finally {
    clearTimeout(timer);

    try {
      database.exec("ROLLBACK");
    } catch {
      // Already committed.
    }

    database.close();
  }
}

export async function runAlertFailure(context) {
  const received = [];
  const receiver = createServer((request_, response) => {
    let body = "";

    request_.setEncoding("utf8");
    request_.on("data", (chunk) => {
      body += chunk;
    });
    request_.on("end", () => {
      received.push({
        delivery: request_.headers["x-savant-delivery"],
        body,
      });
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("fixture alert receiver failure");
    });
  });

  await new Promise((resolve, reject) => {
    receiver.once("error", reject);
    receiver.listen(0, "127.0.0.1", resolve);
  });

  const address = receiver.address();
  const port = address && typeof address === "object" ? address.port : 0;
  const fakeId = "stl_load_alert_fixture";
  const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  context.database
    .prepare(
      `INSERT OR REPLACE INTO settlements
        (id, user_id, api_key_id, model_id, provider_slug, billing_source,
         credit_hold_id, free_reservation_id, subscription_hold_id,
         estimated_micros, status, detail, created_at, settled_at)
       VALUES (?, 'load-alert-fixture', 'load-alert-key', 'load-paid', 'load',
         'credit', NULL, NULL, NULL, 1, 'admitted', NULL, ?, NULL)`,
    )
    .run(fakeId, old);

  try {
    const env = {
      ...process.env,
      DB_PATH: context.dbPath,
      OPERATIONS_ALERT_WEBHOOK_URL: `http://127.0.0.1:${port}/load-failure`,
      OPERATIONS_ALERT_WEBHOOK_SECRET: "load-alert-secret-0123456789",
      OPERATIONS_ALERT_MAX_ATTEMPTS: "1",
      OPERATIONS_ALERT_RETRY_SECONDS: "10",
      OPERATIONS_SETTLEMENT_MAX_AGE_SECONDS: "60",
      OPERATIONS_MIN_REQUESTS: "20",
      NODE_ENV: "test",
      GATEWAY_DISPOSABLE_START: "yes",
    };
    const child = spawn(
      process.execPath,
      [join(context.repo, "scripts", "operations-monitor.mjs")],
      { cwd: context.repo, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const exitCode = await new Promise((resolve) => {
      child.once("exit", (code) => resolve(code));
    });
    const incident = context.database
      .prepare(
        `SELECT fingerprint, delivery_state, delivery_attempts,
                last_delivery_error
         FROM operations_incidents
         WHERE fingerprint = 'settlement:unresolved'`,
      )
      .get();

    return {
      label: "alert-failure",
      exitCode,
      attempts: received.length,
      deliveryHeader: received[0]?.delivery ?? null,
      incident: incident ?? null,
      errorRedacted:
        Boolean(incident?.last_delivery_error) &&
        !incident.last_delivery_error.includes(`127.0.0.1:${port}`),
      stdoutTail: stdout.trim().slice(-300),
      stderrTail: stderr.trim().slice(-300),
      honest:
        exitCode === 1 &&
        received.length === 1 &&
        incident?.delivery_state === "failed" &&
        incident?.delivery_attempts === 1,
    };
  } finally {
    context.database.prepare("DELETE FROM settlements WHERE id = ?").run(fakeId);
    await new Promise((resolve) => receiver.close(resolve));
  }
}

export async function runDrain(context) {
  const { mock, database, fixture, adminCookie } = context;
  const workload = context.envelope.workloads.drain;

  mock.state.inference.streamFrames = workload.frames;
  mock.state.inference.streamFrameDelayMs = workload.frameDelayMs;

  try {
    const streams = Array.from({ length: workload.streams }, () =>
      openStream(context.baseUrl, fixture.paid.secret, {
        model: PAID,
        content: "drain stream probe",
        timeoutMs: 10_000,
      }),
    );

    await Promise.all(streams.map((stream) => stream.started));

    const drain = await request(context.baseUrl, "/api/admin/operations", {
      method: "POST",
      cookie: adminCookie,
      body: { action: "drain", reason: "load acceptance drain probe" },
    });
    const beforeRefusal = counts(database);
    const refused = await jsonCall(context.baseUrl, fixture.paid.secret, {
      model: PAID,
      content: "drain refusal probe",
    });
    const afterRefusal = counts(database);
    const completed = await Promise.all(streams.map((stream) => stream.done));
    const settled = await waitFor(
      () => {
        const current = counts(database);

        return current.usage - beforeRefusal.usage >= workload.streams;
      },
      { timeoutMs: 10_000 },
    );
    const resume = await request(context.baseUrl, "/api/admin/operations", {
      method: "POST",
      cookie: adminCookie,
      body: { action: "resume" },
    });
    const accepted = await jsonCall(context.baseUrl, fixture.paid.secret, {
      model: PAID,
      content: "drain recovered probe",
    });

    return {
      label: "drain",
      drainStatus: drain.status,
      refusedStatus: refused.status,
      refusedRetryAfter: refused.headers.get("retry-after"),
      refusalCreatedNoFinancialRows:
        afterRefusal.usage === beforeRefusal.usage &&
        afterRefusal.admitted === beforeRefusal.admitted &&
        afterRefusal.holds === beforeRefusal.holds,
      streamsCompleted: completed.filter((row) => row.completed).length,
      streamsSettled: Boolean(settled),
      resumeStatus: resume.status,
      acceptedStatus: accepted.status,
      honest:
        drain.status === 200 &&
        refused.status === 503 &&
        refused.headers.get("retry-after") === "30" &&
        completed.every((row) => row.completed) &&
        Boolean(settled) &&
        resume.status === 200 &&
        accepted.status === 200,
    };
  } finally {
    resetInference(mock);
    await request(context.baseUrl, "/api/admin/operations", {
      method: "POST",
      cookie: adminCookie,
      body: { action: "resume" },
    }).catch(() => {});
  }
}

export async function runStorageWriteFailure(context) {
  const { database, fixture } = context;
  const userId = fixture.paid.userId;
  const before = database
    .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
    .get(userId);
  const usageBefore = database
    .prepare("SELECT COUNT(*) AS total FROM usage_events WHERE user_id = ?")
    .get(userId).total;

  // A full volume cannot be reproduced portably on this host. Reject the exact
  // usage insert instead, which exercises the same durable-write failure path
  // without pretending the disk itself was full.
  database.exec(`CREATE TRIGGER load_storage_failure
    BEFORE INSERT ON usage_events
    BEGIN SELECT RAISE(ABORT, 'injected load storage failure'); END`);

  let call;

  try {
    call = await jsonCall(context.baseUrl, fixture.paid.secret, {
      model: PAID,
      content: "storage failure probe",
    });
  } finally {
    database.exec("DROP TRIGGER IF EXISTS load_storage_failure");
  }

  const admitted = database
    .prepare(
      `SELECT COUNT(*) AS total FROM settlements
       WHERE user_id = ? AND status = 'admitted'`,
    )
    .get(userId).total;
  const holds = database
    .prepare("SELECT COUNT(*) AS total FROM credit_holds WHERE user_id = ?")
    .get(userId).total;
  const usageAfterFailure = database
    .prepare("SELECT COUNT(*) AS total FROM usage_events WHERE user_id = ?")
    .get(userId).total;
  const past = new Date(Date.now() - 1_000).toISOString();

  database
    .prepare(
      "UPDATE credit_holds SET expires_at = ? WHERE user_id = ? AND expires_at > ?",
    )
    .run(past, userId, past);
  const account = await request(context.baseUrl, "/api/auth/me", {
    cookie: fixture.paid.cookie,
  });
  const quarantined = database
    .prepare(
      `SELECT COUNT(*) AS total FROM settlements
       WHERE user_id = ? AND status = 'quarantined'`,
    )
    .get(userId).total;
  const quarantineRows = database
    .prepare(
      `SELECT COUNT(*) AS total FROM quarantined_holds
       WHERE user_id = ? AND status = 'quarantined'`,
    )
    .get(userId).total;
  const after = database
    .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
    .get(userId);

  return {
    label: "storage-write-failure",
    status: call.status,
    admitted,
    holds,
    usageBefore,
    usageAfterFailure,
    quarantined,
    quarantineRows,
    accountBefore: before,
    accountAfter: after,
    accountStatus: account.status,
    honest:
      call.status >= 500 &&
      admitted === 1 &&
      holds === 1 &&
      usageAfterFailure === usageBefore &&
      quarantined === 1 &&
      quarantineRows === 1 &&
      after.credit_micros === before.credit_micros &&
      after.held_micros > before.held_micros &&
      account.status === 200,
  };
}

export async function runCrashRecovery(context) {
  const { mock, database, fixture } = context;
  const workload = context.envelope.workloads.crash;
  const userId = fixture.crash.userId;
  const before = database
    .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
    .get(userId);

  mock.state.inference.streamFrames = 50;
  mock.state.inference.streamFrameDelayMs = 50;

  const streams = Array.from({ length: workload.inFlight }, () =>
    openStream(context.baseUrl, fixture.crash.secret, {
      model: PAID,
      content: "crash stream probe",
      timeoutMs: 5_000,
    }),
  );

  await Promise.all(streams.map((stream) => stream.started));
  await context.crashServer();
  await Promise.allSettled(streams.map((stream) => stream.done));

  const admitted = database
    .prepare(
      `SELECT COUNT(*) AS total FROM settlements
       WHERE user_id = ? AND status = 'admitted'`,
    )
    .get(userId).total;
  const holds = database
    .prepare("SELECT COUNT(*) AS total FROM credit_holds WHERE user_id = ?")
    .get(userId).total;
  const usageBefore = database
    .prepare("SELECT COUNT(*) AS total FROM usage_events WHERE user_id = ?")
    .get(userId).total;
  const afterCrash = database
    .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
    .get(userId);

  await context.restartServer();

  const past = new Date(Date.now() - 1_000).toISOString();

  database
    .prepare(
      "UPDATE credit_holds SET expires_at = ? WHERE user_id = ? AND expires_at > ?",
    )
    .run(past, userId, past);
  const account = await request(context.baseUrl, "/api/auth/me", {
    cookie: fixture.crash.cookie,
  });
  const quarantined = database
    .prepare(
      `SELECT COUNT(*) AS total FROM settlements
       WHERE user_id = ? AND status = 'quarantined'`,
    )
    .get(userId).total;
  const quarantineRows = database
    .prepare(
      `SELECT COUNT(*) AS total FROM quarantined_holds WHERE user_id = ?`,
    )
    .get(userId).total;
  const afterQuarantine = database
    .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
    .get(userId);
  const usageAfter = database
    .prepare("SELECT COUNT(*) AS total FROM usage_events WHERE user_id = ?")
    .get(userId).total;

  resetInference(mock);

  return {
    label: "process-crash",
    inFlight: workload.inFlight,
    admittedBeforeRestart: admitted,
    holdsBeforeRestart: holds,
    accountBeforeRestart: before,
    accountAfterCrash: afterCrash,
    accountAfterQuarantine: afterQuarantine,
    accountStatus: account.status,
    usageBefore,
    usageAfter,
    quarantined,
    quarantineRows,
    noDoubleDebit:
      afterQuarantine.credit_micros === before.credit_micros &&
      usageAfter === usageBefore,
    explicitQuarantine:
      admitted === workload.inFlight &&
      holds === workload.inFlight &&
      quarantined === workload.inFlight &&
      quarantineRows === workload.inFlight &&
      account.status === 200,
    honest:
      admitted === workload.inFlight &&
      holds === workload.inFlight &&
      usageBefore === 0 &&
      usageAfter === 0 &&
      quarantined === workload.inFlight &&
      afterQuarantine.credit_micros === before.credit_micros,
  };
}
