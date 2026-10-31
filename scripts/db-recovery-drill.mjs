#!/usr/bin/env node
/**
 * Disposable backup/restore drill.
 *
 * Proves the recovery path instead of asserting it:
 *   1. boot the real production server on a throwaway database,
 *   2. seed a reconcilable credit history, then keep writing usage while the
 *      online backup runs,
 *   3. stop the source, verify and restore the backup into a new file,
 *   4. boot the real server on the restored file, sign in as the operator and
 *      read the reconciliation endpoint,
 *   5. restart once more to prove the restored copy migrates idempotently.
 *
 * The live database is never overwritten. Run `npm run build` first.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import Database from "better-sqlite3";

import {
  createTempWorkspace,
  cookieValue,
  logTail,
  request,
  reservePort,
  startNextServer,
  stopNextServer,
  waitForSchema,
  waitForServer,
} from "./http-suite/harness.mjs";

const execFileAsync = promisify(execFile);
const repo = process.cwd();
const buildMarker = join(repo, ".next", "BUILD_ID");

const ADMIN_PASSWORD = "recovery-drill-admin-password";
const ADMIN_SECRET = "recovery-drill-admin-secret-0123456789abcdef";
const RECOVERY_USER = "recovery-user";
const WRITER_USER = "writer-user";
const NOW = new Date().toISOString();

if (!existsSync(buildMarker)) {
  console.error(
    "recovery-drill: production build missing. Run `npm run build` first.",
  );
  process.exit(1);
}

function check(label, condition, detail = "") {
  if (!condition) {
    throw new Error(`${label}${detail ? `: ${detail}` : ""}`);
  }

  console.log(`recovery-drill: PASS ${label}`);
}

async function runScript(script, args, env) {
  try {
    return await execFileAsync(process.execPath, [script, ...args], {
      cwd: repo,
      env: { ...process.env, ...env },
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    const stderr = error?.stderr?.trim();

    throw new Error(
      `${script} failed: ${stderr || error?.message || String(error)}`,
    );
  }
}

function serverEnv() {
  return {
    ADMIN_PASSWORD,
    ADMIN_SESSION_SECRET: ADMIN_SECRET,
    TRIAL_ENABLED: "false",
    GATEWAY_DISPOSABLE_START: "yes",
    PROVIDER_KEY: "",
    COMMANDCODE_API_KEY: "",
  };
}

function seedFinancialHistory(database) {
  database.pragma("foreign_keys = ON");
  database
    .transaction(() => {
      database
        .prepare(
          `INSERT INTO users
            (id, email, name, status, created_at, credit_micros, held_micros)
           VALUES (?, ?, ?, 'active', ?, ?, ?)`,
        )
        .run(RECOVERY_USER, "recovery@drill.invalid", "Recovery Drill", NOW, 5000, 250);
      database
        .prepare(
          `INSERT INTO users
            (id, email, name, status, created_at, credit_micros, held_micros)
           VALUES (?, ?, ?, 'active', ?, 0, 0)`,
        )
        .run(WRITER_USER, "writer@drill.invalid", "Concurrent Writer", NOW);

      database
        .prepare(
          `INSERT INTO api_keys
            (id, user_id, name, prefix, secret_hash, status, created_at)
           VALUES ('key_recovery', ?, 'drill', 'sg_drill', 'sha256:drill', 'active', ?)`,
        )
        .run(RECOVERY_USER, NOW);

      database
        .prepare(
          `INSERT INTO credit_ledger
            (id, user_id, kind, amount_micros, balance_after_micros, note, created_at)
           VALUES ('ledger_topup', ?, 'topup', 8000, 8000, 'drill top-up', ?),
                  ('ledger_usage', ?, 'usage', -3000, 5000, 'drill usage', ?)`,
        )
        .run(RECOVERY_USER, NOW, RECOVERY_USER, NOW);

      database
        .prepare(
          `INSERT INTO topups
            (id, user_id, provider, provider_ref, amount_micros, currency, status,
             created_at, paid_at)
           VALUES ('topup_recovery', ?, 'stripe', 'cs_recovery_drill', 8000, 'usd',
                   'paid', ?, ?)`,
        )
        .run(RECOVERY_USER, NOW, NOW);

      database
        .prepare(
          `INSERT INTO usage_events
            (id, user_id, api_key_id, model_id, input_tokens, output_tokens,
             weighted_tokens, cost_micros, charged_micros, status, latency_ms,
             created_at)
           VALUES ('usage_recovery', ?, 'key_recovery', 'drill-model', 10, 20, 30,
                   3000, 3000, 'ok', 120, ?)`,
        )
        .run(RECOVERY_USER, NOW);

      database
        .prepare(
          `INSERT INTO credit_holds
            (id, user_id, api_key_id, model_id, hold_micros, created_at, expires_at)
           VALUES ('hold_recovery', ?, 'key_recovery', 'drill-model', 250, ?, ?)`,
        )
        .run(RECOVERY_USER, NOW, new Date(Date.now() + 60_000).toISOString());

      database
        .prepare(
          `INSERT INTO settlements
            (id, user_id, api_key_id, model_id, provider_slug, billing_source,
             credit_hold_id, estimated_micros, status, created_at, settled_at)
           VALUES ('stl_recovery', ?, 'key_recovery', 'drill-model', 'mock',
                   'credit', 'hold_recovery', 3000, 'committed', ?, ?),
                  ('stl_pending', ?, 'key_recovery', 'drill-model', 'mock',
                   'credit', NULL, 100, 'admitted', ?, NULL)`,
        )
        .run(RECOVERY_USER, NOW, NOW, RECOVERY_USER, NOW);

      database
        .prepare(
          `INSERT INTO quarantined_holds
            (id, kind, user_id, api_key_id, model_id, reserved, created_at,
             expired_at, status, note)
           VALUES ('q_recovery', 'credit', ?, 'key_recovery', 'drill-model', 250,
                   ?, ?, 'quarantined', 'drill quarantine')`,
        )
        .run(RECOVERY_USER, NOW, new Date(Date.now() + 60_000).toISOString());

      database
        .prepare(
          `INSERT INTO billing_events (id, type, processed_at, status, attempts)
           VALUES ('evt_recovery', 'checkout.session.completed', ?, 'processed', 1)`,
        )
        .run(NOW);

      database
        .prepare(
          `INSERT INTO balance_baselines
            (id, user_id, baseline_micros, note, created_at)
           VALUES ('baseline_recovery', ?, 0, 'drill opening balance', ?)`,
        )
        .run(RECOVERY_USER, NOW);
    })
    .immediate();
}

async function signIn(baseUrl) {
  const login = await request(baseUrl, "/api/admin/session", {
    method: "POST",
    body: { password: ADMIN_PASSWORD },
  });

  check("admin sign-in succeeds", login.status === 200, `status ${login.status}`);

  const token = cookieValue(login, "sg_admin");

  check("admin cookie is issued", Boolean(token));

  return `sg_admin=${token}`;
}

async function readReconciliation(baseUrl, cookie) {
  const report = await request(baseUrl, "/api/admin/reconciliation", { cookie });

  check(
    "reconciliation endpoint answers",
    report.status === 200,
    `status ${report.status} ${report.text.slice(0, 120)}`,
  );

  const account = report.json?.accounts?.find(
    (row) => row.userId === RECOVERY_USER,
  );

  check("restored account is present", Boolean(account));
  check(
    "restored credit balance survives",
    account.balanceMicros === 5000,
    `balance ${account.balanceMicros}`,
  );
  check(
    "restored ledger sum survives",
    account.ledgerMicros === 5000,
    `ledger ${account.ledgerMicros}`,
  );
  check(
    "restored account reconciles",
    account.balanced === true && account.differenceMicros === 0,
    `difference ${account.differenceMicros}`,
  );
  check(
    "restored totals reconcile",
    report.json.totals.balanced === true &&
      report.json.totals.differenceMicros === 0,
    `difference ${report.json.totals.differenceMicros}`,
  );
  check(
    "restored held capacity survives",
    report.json.totals.heldMicros === 250,
    `held ${report.json.totals.heldMicros}`,
  );
  check(
    "restored quarantine survives",
    report.json.totals.quarantinedMicros === 250,
    `quarantined ${report.json.totals.quarantinedMicros}`,
  );

  return report.json;
}

const workspace = await createTempWorkspace();
const backupDirectory = join(workspace.directory, "backups");
const restoredPath = join(workspace.directory, "restored.db");
let sourceServer = null;
let restoredServer = null;
let sourceDatabase = null;
let writer = null;
let writerTimer = null;
let writerErrors = 0;
let writerRows = 0;

try {
  const startedAt = Date.now();
  const sourcePort = await reservePort();

  sourceServer = startNextServer({
    repo,
    port: sourcePort,
    dbPath: workspace.dbPath,
    env: serverEnv(),
  });

  const sourceUrl = `http://127.0.0.1:${sourcePort}`;

  await waitForServer({ baseUrl: sourceUrl, child: sourceServer.child, logs: sourceServer.logs });
  sourceDatabase = await waitForSchema(workspace.dbPath);
  seedFinancialHistory(sourceDatabase);

  writer = new Database(workspace.dbPath);
  writer.pragma("busy_timeout = 5000");

  const insertWriterRow = writer.prepare(
    `INSERT INTO usage_events
      (id, user_id, model_id, status, created_at, charged_micros)
     VALUES (?, ?, 'drill-model', 'ok', ?, 0)`,
  );

  writerTimer = setInterval(() => {
    try {
      insertWriterRow.run(
        `usage_writer_${process.pid}_${writerRows}`,
        WRITER_USER,
        new Date().toISOString(),
      );
      writerRows += 1;
    } catch {
      writerErrors += 1;
    }
  }, 5);

  await runScript("scripts/db-backup.mjs", [], {
    DB_PATH: workspace.dbPath,
    BACKUP_DIR: backupDirectory,
    BACKUP_RETENTION: "3",
  });

  clearInterval(writerTimer);
  writerTimer = null;
  writer.close();
  writer = null;

  check("writes continued during the backup", writerRows > 0, `${writerRows} rows`);
  check("writes did not fail during the backup", writerErrors === 0, `${writerErrors} errors`);

  const backups = readdirSync(backupDirectory).filter((name) =>
    name.endsWith(".db"),
  );

  check("exactly one backup was written", backups.length === 1, `${backups.length} files`);

  const backupPath = join(backupDirectory, backups[0]);
  const metadata = JSON.parse(readFileSync(`${backupPath}.json`, "utf8"));

  check("backup metadata is present", metadata.format === "savant-backup/1");
  check("backup checksum is recorded", /^[a-f0-9]{64}$/.test(metadata.sha256));
  check("backup integrity is ok", metadata.integrity === "ok");

  await stopNextServer(sourceServer.child);
  sourceServer = null;
  sourceDatabase.close();
  sourceDatabase = null;

  await runScript("scripts/db-restore.mjs", [
    "--backup",
    backupPath,
    "--target",
    restoredPath,
  ]);

  const receipt = JSON.parse(readFileSync(`${restoredPath}.restore.json`, "utf8"));

  check("restore receipt is verified", receipt.verified === true);
  check("restore integrity is ok", receipt.integrity === "ok");
  check("restored ledger is balanced", receipt.financial.balanced === true);
  check(
    "restored balance survives the copy",
    receipt.financial.balance_micros === 5000,
    `${receipt.financial.balance_micros}`,
  );
  check(
    "restored unresolved settlement is reported",
    receipt.financial.unresolved_settlements === 1,
    `${receipt.financial.unresolved_settlements}`,
  );
  check(
    "restored quarantine is reported",
    receipt.financial.quarantined_holds === 1,
    `${receipt.financial.quarantined_holds}`,
  );
  check(
    "restored payment event survives",
    receipt.counts.billing_events === 1,
    `${receipt.counts.billing_events}`,
  );

  const restoredPort = await reservePort();

  restoredServer = startNextServer({
    repo,
    port: restoredPort,
    dbPath: restoredPath,
    env: serverEnv(),
  });

  const restoredUrl = `http://127.0.0.1:${restoredPort}`;

  await waitForServer({
    baseUrl: restoredUrl,
    child: restoredServer.child,
    logs: restoredServer.logs,
  });

  const firstCookie = await signIn(restoredUrl);

  await readReconciliation(restoredUrl, firstCookie);

  await stopNextServer(restoredServer.child);
  restoredServer = null;

  const restartPort = await reservePort();

  restoredServer = startNextServer({
    repo,
    port: restartPort,
    dbPath: restoredPath,
    env: serverEnv(),
  });

  const restartUrl = `http://127.0.0.1:${restartPort}`;

  await waitForServer({
    baseUrl: restartUrl,
    child: restoredServer.child,
    logs: restoredServer.logs,
  });

  const secondCookie = await signIn(restartUrl);

  await readReconciliation(restartUrl, secondCookie);

  check(
    "restored copy survives a second startup",
    true,
    `${Date.now() - startedAt}ms total`,
  );

  console.log(
    `recovery-drill: PASS (${writerRows} concurrent writes, backup ${backups[0]}, ` +
      `${Date.now() - startedAt}ms)`,
  );
} catch (error) {
  console.error(
    `recovery-drill FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );

  for (const [name, server] of [
    ["source", sourceServer],
    ["restored", restoredServer],
  ]) {
    if (server) console.error(`recovery-drill: ${name} log tail\n${logTail(server.logs)}`);
  }

  process.exitCode = 1;
} finally {
  if (writerTimer) clearInterval(writerTimer);
  writer?.close();
  sourceDatabase?.close();
  if (sourceServer) await stopNextServer(sourceServer.child);
  if (restoredServer) await stopNextServer(restoredServer.child);
  await workspace.remove();
}
