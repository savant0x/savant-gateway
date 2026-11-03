import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import pg from "pg";

import { request } from "../http-suite/harness.mjs";
import { jsonCall, openStream, waitFor } from "./client.mjs";
import { counts } from "./offered.mjs";

const PAID = "load-paid";

async function latestUsage(database, userId) {
  return database
    .prepare(
      `SELECT status, charged_micros, billing_source, error
       FROM usage_events WHERE user_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
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
        const before = await counts(database);
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
          async () => {
            const current = await counts(database);

            return (
              current.usage - before.usage >= 1 &&
              current.committed + current.quarantined - before.committed -
                before.quarantined >=
                1
            );
          },
          { timeoutMs: 8_000 },
        );
        const usage = await latestUsage(database, fixture.paid.userId);
        const chargedMicros = Number(usage?.charged_micros ?? 0);

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
          chargedMicros,
          noCharge: chargedMicros === 0,
          chargeOk: fault.allowCharge === true || chargedMicros === 0,
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
  const usage = await latestUsage(database, fixture.free.userId);
  const chargedMicros = Number(usage?.charged_micros ?? 0);

  return {
    label: "quota-reset",
    currentStatus: current.status,
    expiredStatus: expired.status,
    recoveredStatus: recovered.status,
    freeCallStatus: freeCall.status,
    freeBillingSource: usage?.billing_source ?? null,
    freeChargedMicros: chargedMicros,
    honest:
      current.status === 200 &&
      expired.status === 503 &&
      recovered.status === 200 &&
      freeCall.status === 200 &&
      usage?.billing_source === "free" &&
      chargedMicros === 0,
  };
}

export async function runDatabaseContention(context) {
  const client = new pg.Client({
    connectionString: context.connectionString,
  });

  await client.connect();

  let release;
  const released = new Promise((resolve) => {
    release = resolve;
  });

  await client.query("BEGIN");
  // `BEGIN IMMEDIATE` has no PostgreSQL equivalent. An exclusive lock on the
  // row source every admitted call reads produces the same observable: the
  // request waits for the competing writer instead of racing it.
  await client.query("LOCK TABLE users IN ACCESS EXCLUSIVE MODE");

  const timer = setTimeout(async () => {
    try {
      await client.query("COMMIT");
    } catch {
      // The request path reports its own failure; the finally block releases.
    }

    release();
  }, 250);

  try {
    const before = await counts(context.database);
    const call = await jsonCall(context.baseUrl, context.fixture.paid.secret, {
      model: PAID,
      content: "contention probe",
    });

    await released;

    const settled = await waitFor(
      async () => {
        const current = await counts(context.database);

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
      await client.query("ROLLBACK");
    } catch {
      // Already committed.
    }

    await client.end();
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

  await context.database
    .prepare(
      `INSERT INTO settlements
        (id, user_id, api_key_id, model_id, provider_slug, billing_source,
         credit_hold_id, free_reservation_id, subscription_hold_id,
         estimated_micros, status, detail, created_at, settled_at)
       VALUES (?, 'load-alert-fixture', 'load-alert-key', 'load-paid', 'load',
         'credit', NULL, NULL, NULL, 1, 'admitted', NULL, ?, NULL)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(fakeId, old);

  try {
    const env = {
      ...process.env,
      DATABASE_URL: context.connectionString,
      OPERATIONS_ALERT_WEBHOOK_URL: `http://127.0.0.1:${port}/load-failure`,
      OPERATIONS_ALERT_WEBHOOK_SECRET: "load-alert-secret-0123456789",
      OPERATIONS_ALERT_MAX_ATTEMPTS: "1",
      OPERATIONS_ALERT_RETRY_SECONDS: "10",
      OPERATIONS_SETTLEMENT_MAX_AGE_SECONDS: "60",
      OPERATIONS_MIN_REQUESTS: "20",
      NODE_ENV: "test",
      GATEWAY_DISPOSABLE_START: "yes",
    };

    delete env.DB_PATH;
    delete env.PG_LOCAL_PATH;

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
    const incident = await context.database
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
        Number(incident?.delivery_attempts) === 1,
    };
  } finally {
    await context.database
      .prepare("DELETE FROM settlements WHERE id = ?")
      .run(fakeId);
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
    const beforeRefusal = await counts(database);
    const refused = await jsonCall(context.baseUrl, fixture.paid.secret, {
      model: PAID,
      content: "drain refusal probe",
    });
    const afterRefusal = await counts(database);
    const completed = await Promise.all(streams.map((stream) => stream.done));
    const settled = await waitFor(
      async () => {
        const current = await counts(database);

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
  const before = await database
    .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
    .get(userId);
  const usageBefore = await database
    .prepare("SELECT COUNT(*) AS total FROM usage_events WHERE user_id = ?")
    .get(userId);

  // A full volume cannot be reproduced portably on this host. Reject the exact
  // usage insert instead, which exercises the same durable-write failure path
  // without pretending the disk itself was full.
  await database.exec(`
    CREATE OR REPLACE FUNCTION load_storage_failure() RETURNS trigger AS $load$
    BEGIN
      RAISE EXCEPTION 'injected load storage failure';
    END;
    $load$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS load_storage_failure_trigger ON usage_events;
    CREATE TRIGGER load_storage_failure_trigger
      BEFORE INSERT ON usage_events
      FOR EACH ROW EXECUTE FUNCTION load_storage_failure();
  `);

  let call;

  try {
    call = await jsonCall(context.baseUrl, fixture.paid.secret, {
      model: PAID,
      content: "storage failure probe",
    });
  } finally {
    await database.exec(`
      DROP TRIGGER IF EXISTS load_storage_failure_trigger ON usage_events;
      DROP FUNCTION IF EXISTS load_storage_failure();
    `);
  }

  const admitted = await database
    .prepare(
      `SELECT COUNT(*) AS total FROM settlements
       WHERE user_id = ? AND status = 'admitted'`,
    )
    .get(userId);
  const holds = await database
    .prepare("SELECT COUNT(*) AS total FROM credit_holds WHERE user_id = ?")
    .get(userId);
  const usageAfterFailure = await database
    .prepare("SELECT COUNT(*) AS total FROM usage_events WHERE user_id = ?")
    .get(userId);
  const past = new Date(Date.now() - 1_000).toISOString();

  await database
    .prepare(
      "UPDATE credit_holds SET expires_at = ? WHERE user_id = ? AND expires_at > ?",
    )
    .run(past, userId, past);
  const account = await request(context.baseUrl, "/api/auth/me", {
    cookie: fixture.paid.cookie,
  });
  const quarantined = await database
    .prepare(
      `SELECT COUNT(*) AS total FROM settlements
       WHERE user_id = ? AND status = 'quarantined'`,
    )
    .get(userId);
  const quarantineRows = await database
    .prepare(
      `SELECT COUNT(*) AS total FROM quarantined_holds
       WHERE user_id = ? AND status = 'quarantined'`,
    )
    .get(userId);
  const after = await database
    .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
    .get(userId);
  const admittedTotal = Number(admitted?.total ?? 0);
  const holdTotal = Number(holds?.total ?? 0);
  const usageBeforeTotal = Number(usageBefore?.total ?? 0);
  const usageAfterTotal = Number(usageAfterFailure?.total ?? 0);
  const quarantinedTotal = Number(quarantined?.total ?? 0);
  const quarantineRowTotal = Number(quarantineRows?.total ?? 0);
  const creditBefore = Number(before?.credit_micros ?? 0);
  const creditAfter = Number(after?.credit_micros ?? 0);
  const heldBefore = Number(before?.held_micros ?? 0);
  const heldAfter = Number(after?.held_micros ?? 0);

  return {
    label: "storage-write-failure",
    status: call.status,
    admitted: admittedTotal,
    holds: holdTotal,
    usageBefore: usageBeforeTotal,
    usageAfterFailure: usageAfterTotal,
    quarantined: quarantinedTotal,
    quarantineRows: quarantineRowTotal,
    accountBefore: { credit_micros: creditBefore, held_micros: heldBefore },
    accountAfter: { credit_micros: creditAfter, held_micros: heldAfter },
    accountStatus: account.status,
    honest:
      call.status >= 500 &&
      admittedTotal === 1 &&
      holdTotal === 1 &&
      usageAfterTotal === usageBeforeTotal &&
      quarantinedTotal === 1 &&
      quarantineRowTotal === 1 &&
      creditAfter === creditBefore &&
      heldAfter > heldBefore &&
      account.status === 200,
  };
}

export async function runCrashRecovery(context) {
  const { mock, database, fixture } = context;
  const workload = context.envelope.workloads.crash;
  const userId = fixture.crash.userId;
  const before = await database
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

  const admitted = await database
    .prepare(
      `SELECT COUNT(*) AS total FROM settlements
       WHERE user_id = ? AND status = 'admitted'`,
    )
    .get(userId);
  const holds = await database
    .prepare("SELECT COUNT(*) AS total FROM credit_holds WHERE user_id = ?")
    .get(userId);
  const usageBefore = await database
    .prepare("SELECT COUNT(*) AS total FROM usage_events WHERE user_id = ?")
    .get(userId);
  const afterCrash = await database
    .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
    .get(userId);

  await context.restartServer();

  const past = new Date(Date.now() - 1_000).toISOString();

  await database
    .prepare(
      "UPDATE credit_holds SET expires_at = ? WHERE user_id = ? AND expires_at > ?",
    )
    .run(past, userId, past);
  const account = await request(context.baseUrl, "/api/auth/me", {
    cookie: fixture.crash.cookie,
  });
  const quarantined = await database
    .prepare(
      `SELECT COUNT(*) AS total FROM settlements
       WHERE user_id = ? AND status = 'quarantined'`,
    )
    .get(userId);
  const quarantineRows = await database
    .prepare(
      `SELECT COUNT(*) AS total FROM quarantined_holds
       WHERE user_id = ?`,
    )
    .get(userId);
  const afterQuarantine = await database
    .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
    .get(userId);
  const usageAfter = await database
    .prepare("SELECT COUNT(*) AS total FROM usage_events WHERE user_id = ?")
    .get(userId);
  const admittedTotal = Number(admitted?.total ?? 0);
  const holdTotal = Number(holds?.total ?? 0);
  const usageBeforeTotal = Number(usageBefore?.total ?? 0);
  const usageAfterTotal = Number(usageAfter?.total ?? 0);
  const quarantinedTotal = Number(quarantined?.total ?? 0);
  const quarantineRowTotal = Number(quarantineRows?.total ?? 0);
  const creditBefore = Number(before?.credit_micros ?? 0);
  const creditAfter = Number(afterQuarantine?.credit_micros ?? 0);

  resetInference(mock);

  return {
    label: "process-crash",
    inFlight: workload.inFlight,
    admittedBeforeRestart: admittedTotal,
    holdsBeforeRestart: holdTotal,
    accountBeforeRestart: {
      credit_micros: creditBefore,
      held_micros: Number(before?.held_micros ?? 0),
    },
    accountAfterCrash: {
      credit_micros: Number(afterCrash?.credit_micros ?? 0),
      held_micros: Number(afterCrash?.held_micros ?? 0),
    },
    accountAfterQuarantine: {
      credit_micros: creditAfter,
      held_micros: Number(afterQuarantine?.held_micros ?? 0),
    },
    accountStatus: account.status,
    usageBefore: usageBeforeTotal,
    usageAfter: usageAfterTotal,
    quarantined: quarantinedTotal,
    quarantineRows: quarantineRowTotal,
    noDoubleDebit: creditAfter === creditBefore && usageAfterTotal === usageBeforeTotal,
    explicitQuarantine:
      admittedTotal === workload.inFlight &&
      holdTotal === workload.inFlight &&
      quarantinedTotal === workload.inFlight &&
      quarantineRowTotal === workload.inFlight &&
      account.status === 200,
    honest:
      admittedTotal === workload.inFlight &&
      holdTotal === workload.inFlight &&
      usageBeforeTotal === 0 &&
      usageAfterTotal === 0 &&
      quarantinedTotal === workload.inFlight &&
      creditAfter === creditBefore,
  };
}
