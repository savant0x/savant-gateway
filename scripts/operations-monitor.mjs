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
 * It opens the configured PostgreSQL database directly instead of importing the
 * Next server store, so it does not depend on Next's `server-only` runtime. It
 * never runs a destructive migration and refuses a missing configuration.
 *
 * Two variables are accepted, in this order:
 *
 *   DATABASE_URL    a PostgreSQL server (production)
 *   PG_LOCAL_PATH   a PGlite directory (local and single-process deployments)
 *
 * Example:
 *   DATABASE_URL=postgres://... node scripts/operations-monitor.mjs
 *   PG_LOCAL_PATH=./data/pg node scripts/operations-monitor.mjs
 */
import { resolve } from "node:path";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { runOperationsMonitor } from "../lib/storage/store/operations.ts";

const remote = process.env.DATABASE_URL?.trim();
const local = process.env.PG_LOCAL_PATH?.trim();
let database = null;

function fail(message) {
  console.error(`operations-monitor FAIL: ${message}`);
  process.exitCode = 1;
}

try {
  if (!remote && !local) {
    fail("DATABASE_URL or PG_LOCAL_PATH must name the live database.");
  } else {
    database = await createStorageDatabase({
      env: process.env,
      localDirectory: remote ? undefined : resolve(local),
    });

    const result = await runOperationsMonitor(database);

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
  await database?.close();
}
