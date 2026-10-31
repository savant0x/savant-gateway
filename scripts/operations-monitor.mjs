#!/usr/bin/env node
/**
 * Scheduled operations monitor.
 *
 * Invoke from cron, a Fly scheduled machine or an external scheduler. One run
 * evaluates durable state, reconciles incident rows and attempts due alert
 * deliveries. The process exits non-zero only when the monitor itself could not
 * deliver a configured alert; an unconfigured webhook is reported as such and
 * is not treated as a successful delivery or a scheduler failure.
 *
 * It opens the live SQLite file directly instead of importing the Next server
 * store, so it does not depend on Next's `server-only` runtime. It never runs a
 * migration and refuses a missing file.
 *
 * Example:
 *   DB_PATH=/data/gateway.db node scripts/operations-monitor.mjs
 */
import { resolve } from "node:path";

import Database from "better-sqlite3";

import {
  deliverAlert,
  readAlertTransportConfig,
} from "../lib/alert-transport.ts";
import {
  readOperationsSnapshot,
  readOperationsThresholds,
  runOperationsTick,
} from "../lib/operations.ts";
import { readStorageObservation } from "../lib/operations-storage.ts";

const configured = process.env.DB_PATH?.trim();
let database = null;

function fail(message) {
  console.error(`operations-monitor FAIL: ${message}`);
  process.exitCode = 1;
}

try {
  if (!configured || configured === ":memory:") {
    fail("DB_PATH must name the live SQLite file.");
  } else {
    const dbPath = resolve(configured);

    database = new Database(dbPath, { fileMustExist: true });
    database.pragma("busy_timeout = 5000");

    const thresholds = readOperationsThresholds(process.env);
    const now = new Date().toISOString();
    const snapshot = readOperationsSnapshot(database, {
      now,
      thresholds,
      storage: readStorageObservation(dbPath, process.env, Date.parse(now)),
    });
    const config = readAlertTransportConfig(process.env);
    const result = await runOperationsTick({
      database,
      snapshot,
      thresholds,
      transport: (payload) => deliverAlert(payload, config),
      now,
    });

    console.log(
      JSON.stringify(
        {
          at: result.snapshot.generatedAt,
          admission: result.snapshot.admission.state,
          traffic: result.snapshot.traffic,
          active: result.active,
          opened: result.opened,
          reopened: result.reopened,
          resolved: result.resolved,
          delivered: result.delivered,
          failed: result.failed,
          unconfigured: result.unconfigured,
        },
        null,
        2,
      ),
    );

    if (result.failed > 0) {
      fail(
        `${result.failed} configured alert delivery attempt(s) failed; ` +
          "see /admin/operations for the recorded error.",
      );
    }

    if (result.unconfigured > 0) {
      console.error(
        "operations-monitor: alert webhook is not configured; incidents remain durable " +
          "and are visible in /admin/operations.",
      );
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  database?.close();
}
