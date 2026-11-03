#!/usr/bin/env node
/**
 * Bounded load, failure and recovery acceptance.
 *
 * Requires a completed production build. It boots `next start` on a disposable
 * database and a local upstream double, then measures ramp/burst/steady/mixed
 * traffic, streams and cancellations, key churn, competing reservations,
 * provider faults, quota reset, database contention, alert failure, drain,
 * process crash and a durable storage-write failure.
 *
 * This is a local measurement, not proof of real upstream capacity. The
 * operator envelope in config/load-envelope.json stays `candidate` until the
 * operator approves a traffic cap and the same run is repeated on the selected
 * production-equivalent host with a real provider budget.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import {
  cookieValue,
  createTempWorkspace,
  logTail,
  request,
  reservePort,
  startMockUpstream,
  startNextServer,
  stopNextServer,
  waitForServer,
} from "./http-suite/harness.mjs";
import {
  openDatabase,
  startDatabaseServer,
  waitForSchema,
} from "./http-suite/db.mjs";
import { approvalProblem, loadServerEnvironment, readEnvelope } from "./load/envelope.mjs";
import { LOAD_PROVIDER_KEY_VALUE, seedLoadFixture } from "./load/fixture.mjs";
import { runAllWorkloads } from "./load/workloads.mjs";
import {
  runAlertFailure,
  runCrashRecovery,
  runDatabaseContention,
  runDrain,
  runFaultMatrix,
  runQuotaReset,
  runStorageWriteFailure,
} from "./load/faults.mjs";
import { databaseBytes, rssMb } from "./load/metrics.mjs";
import { reconcile } from "./load/reconcile.mjs";
import { evaluateVerdict } from "./load/verdict.mjs";

const ADMIN_PASSWORD = "load-acceptance-admin-password";
const ADMIN_SECRET = "load-acceptance-admin-secret-0123456789abcdef";
const repo = process.cwd();
const buildMarker = join(repo, ".next", "BUILD_ID");
const requireApproval = process.argv.includes("--require-approval");
const jsonFlag = process.argv.indexOf("--json");
const jsonPath = jsonFlag >= 0 ? process.argv[jsonFlag + 1] : null;

if (!existsSync(buildMarker)) {
  console.error(
    "load-acceptance: production build missing. Run `npm run build` first.",
  );
  process.exit(1);
}

function waitExit(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();

  return new Promise((resolve) => child.once("exit", resolve));
}

function gitHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  });

  return result.status === 0 ? result.stdout.trim() : null;
}

const { envelope, path: envelopePath, offered } = await readEnvelope(repo);
const approval = approvalProblem(envelope);
const workspace = await createTempWorkspace();
const serverPort = await reservePort();
const databasePort = await reservePort();
const suppliedDatabaseUrl =
  process.env.LOAD_TEST_DATABASE_URL?.trim() ||
  process.env.TEST_DATABASE_URL?.trim() ||
  null;
const mock = await startMockUpstream({ expectedKey: LOAD_PROVIDER_KEY_VALUE });
const baseUrl = `http://127.0.0.1:${serverPort}`;
const databaseServer = await startDatabaseServer({
  directory: workspace.databaseDirectory,
  port: databasePort,
  connectionString: suppliedDatabaseUrl ?? undefined,
  requireReal: true,
}).catch(async (error) => {
  const detail = error instanceof Error ? error.message : String(error);

  await mock.close();
  await workspace.remove();
  console.error(
    "load-acceptance FAIL: the gate requires real PostgreSQL. Set " +
      `LOAD_TEST_DATABASE_URL or TEST_DATABASE_URL to a disposable endpoint, ` +
      `or start Docker (${detail}).`,
  );
  process.exit(1);
});
const tomorrow = new Date();
let server = null;
let database = null;
let currentChild = null;
let peakRssMb = null;
let sampler = null;

mock.state.quota.resets_at_utc = tomorrow.toISOString();
tomorrow.setUTCHours(24, 0, 0, 0);
mock.state.quota.resets_at_utc = tomorrow.toISOString();

function serverEnvironment() {
  return {
    ...loadServerEnvironment(envelope),
    ADMIN_PASSWORD,
    ADMIN_SESSION_SECRET: ADMIN_SECRET,
    NEXT_PUBLIC_SITE_URL: baseUrl,
    LOAD_PROVIDER_KEY: LOAD_PROVIDER_KEY_VALUE,
  };
}

async function boot() {
  server = startNextServer({
    repo,
    port: serverPort,
    databaseUrl: databaseServer.connectionString,
    env: serverEnvironment(),
  });
  currentChild = server.child;

  await waitForServer({ baseUrl, child: server.child, logs: server.logs });
}

async function crashServer() {
  const child = server?.child;

  if (!child || child.exitCode !== null) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGKILL");
  }

  await waitExit(child);
  await sleep(500);
}

async function restartServer() {
  await boot();
}

try {
  await boot();

  database = await openDatabase(databaseServer.connectionString);
  await waitForSchema(database);
  const fixture = await seedLoadFixture(database, { mockBaseUrl: mock.baseUrl });
  const login = await request(baseUrl, "/api/admin/session", {
    method: "POST",
    body: { password: ADMIN_PASSWORD },
  });

  if (login.status !== 200) {
    throw new Error(
      `operator sign-in failed with ${login.status}: ${login.text.slice(0, 200)}`,
    );
  }

  const adminCookie = `sg_admin=${cookieValue(login, "sg_admin")}`;
  const runtime = await request(baseUrl, "/api/provider/runtime?slug=load", {
    cookie: adminCookie,
  });

  if (runtime.status !== 200) {
    throw new Error(
      `fixture provider observation failed with ${runtime.status}: ${runtime.text.slice(0, 200)}`,
    );
  }

  sampler = setInterval(() => {
    const value = rssMb(currentChild?.pid);
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      peakRssMb = Math.max(peakRssMb ?? 0, numeric);
    }
  }, 250);

  const context = {
    repo,
    baseUrl,
    connectionString: databaseServer.connectionString,
    database,
    mock,
    fixture,
    envelope,
    adminCookie,
    crashServer,
    restartServer,
  };

  const workloads = await runAllWorkloads(context);
  const faults = await runFaultMatrix(context);
  const databaseContention = await runDatabaseContention(context);
  const alertFailure = await runAlertFailure(context);
  const drain = await runDrain(context);
  const crashRecovery = await runCrashRecovery(context);
  const storageFailure = await runStorageWriteFailure(context);
  const quotaReset = await runQuotaReset(context);

  clearInterval(sampler);
  sampler = null;
  peakRssMb = peakRssMb ?? rssMb(currentChild?.pid);

  const reconciliation = await reconcile(database);
  const bytes = await databaseBytes(database);
  const results = {
    ramp: workloads.ramp,
    steady: workloads.steady,
    burst: workloads.burst,
    streams: workloads.streams,
    mixedBilling: workloads.mixedBilling,
    reservations: workloads.reservations,
    keyChurn: workloads.keyChurn,
    faults,
    databaseContention,
    alertFailure,
    drain,
    crashRecovery,
    storageFailure,
    quotaReset,
  };
  const verdict = evaluateVerdict({
    envelope,
    results,
    reconciliation,
    peakRssMb,
    dbBytes: bytes,
    envelopeApproved: approval === null,
    approvalProblem: approval,
  });

  const receipt = {
    kind: "savant-load-acceptance",
    generatedAt: new Date().toISOString(),
    commit: gitHead(),
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    artifact: {
      buildId: (await readFile(buildMarker, "utf8")).trim(),
      storage: "PostgreSQL, disposable database",
      databasePath: "disposable PostgreSQL endpoint",
      databaseBytes: bytes,
      envelope: envelopePath,
      envelopeStatus: envelope.status,
      operatorApproval: envelope.operatorApproval,
      approvalProblem: approval,
    },
    configuration: {
      providerRpm: envelope.environment.providerRpm,
      providerConcurrency: envelope.environment.providerConcurrency,
      upstreamDelayMs: envelope.environment.upstreamDelayMs,
      completionBodyBytes: envelope.environment.completionBodyBytes,
      streamBytes: envelope.environment.streamBytes,
      offeredCallBudget: offered,
      maxOfferedCalls: envelope.budget.maxOfferedCalls,
    },
    workload: envelope.workloads,
    resources: {
      peakRssMb,
      databaseBytes: bytes,
    },
    results,
    reconciliation,
    verdict,
    limitations: [
      "The upstream is a local fixture. No real provider request, account, budget or network latency is measured.",
      "The database is a disposable PostgreSQL database, not the selected production host or a production-sized dataset.",
      "ENOSPC was not reproduced. A storage-write rejection was injected at the usage INSERT, which exercises the same durable rollback/quarantine path.",
      "Actual provider deadline timeouts (120s JSON, 300s stream) were not waited out; provider disconnect and truncated stream are covered.",
      "No hosted proxy, TLS ingress or CDN behavior is exercised.",
      "The envelope is candidate, not operator-approved. The local pass is not accepted production capacity.",
    ],
  };

  if (jsonPath) {
    await writeFile(jsonPath, `${JSON.stringify(receipt, null, 2)}\n`);
  }

  console.log(JSON.stringify(receipt, null, 2));

  if (!verdict.pass) {
    console.error(
      `load-acceptance FAIL: ${verdict.failures.length} check(s) failed`,
    );
    for (const failure of verdict.failures) {
      console.error(`- ${failure.name}: ${failure.detail}`);
    }
    process.exitCode = 1;
  } else if (requireApproval && approval !== null) {
    console.error(`load-acceptance REFUSED: ${approval}`);
    process.exitCode = 2;
  } else {
    console.error(
      approval === null
        ? "load-acceptance PASS: measured envelope has dated operator approval."
        : "load-acceptance PASS (measurement): candidate envelope only; operator approval and hosted acceptance remain open.",
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`load-acceptance FAIL: ${message}`);

  if (server) console.error(`load-acceptance: server log tail\n${logTail(server.logs)}`);

  process.exitCode = 1;
} finally {
  if (sampler) clearInterval(sampler);
  await database?.close();
  await databaseServer.close();
  await mock.close();
  if (server) await stopNextServer(server.child);
  await workspace.remove();
}
