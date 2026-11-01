import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  getAdmissionControl,
  getAnalyticsData,
  getBenchmarkStatus,
  getOperationsThresholds,
  getOverviewStats,
  listBenchmarks,
  normalizeAnalyticsRange,
} from "../lib/store-facade/insights.ts";
import { bindStoreRuntime } from "../lib/store-facade/runtime.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

/**
 * Reporting façade on the target engine (FID-086, step 4).
 *
 * The operator pages read these; the test therefore checks the shape each page
 * depends on rather than the arithmetic, which the ported stores already cover:
 * a stats object, an admission state, a dense analytics series, a benchmark
 * list, and the two pure helpers staying pure.
 */

test("reporting façade answers from the bound database", async () => {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  bindStoreRuntime(async () => db);

  try {
    const stats = await getOverviewStats();

    assert.equal(typeof stats, "object");
    assert.ok(stats !== null);

    const admission = await getAdmissionControl();

    assert.equal(admission.state, "open");

    const report = await getAnalyticsData(30);

    assert.equal(report.rangeDays, 30);
    assert.equal(report.series.length, 30);
    assert.equal(report.totals.requests, 0);

    const benchmarks = await listBenchmarks();

    assert.equal(typeof benchmarks, "object");
    assert.ok(benchmarks !== null);
    assert.equal(typeof (await getBenchmarkStatus()), "object");

    assert.equal(
      typeof normalizeAnalyticsRange,
      "function",
      "range normalization stays a pure function",
    );
    assert.equal(normalizeAnalyticsRange("60"), 30);
    assert.equal(typeof getOperationsThresholds(), "object");
  } finally {
    await db.close();
  }
});
