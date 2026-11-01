import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  beginSync,
  claimSyncLease,
  completeSync,
  failSync,
  getBenchmarkStatus,
  latestSuccessfulSync,
  latestSyncAttempt,
  listBenchmarks,
  releaseSyncLease,
  syncLeaseHeld,
  writeBenchmarks,
} from "../lib/storage/store/benchmarks.ts";
import {
  bumpAdminSessionEpoch,
  getAdminSessionEpoch,
} from "../lib/storage/store/admin.ts";
import { BENCHMARK_SOURCE } from "../lib/benchmarks.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = new Date().toISOString();
const LATER = new Date(Date.now() + 60_000).toISOString();

/**
 * Batch B's first slice (FID-086).
 *
 * The lease is the subject: a second sync must not be able to run while the
 * first holds it, and the release must be scoped to the run that took it. The
 * admin epoch is the small one: the increment has to report the value it
 * produced, because every issued cookie is compared against it.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  return db;
}

function match(overrides = {}) {
  return {
    modelId: "model-1",
    sourceId: "aa-1",
    sourceSlug: "model-1",
    intelligenceIndex: 42,
    codingIndex: 30,
    agenticIndex: 20,
    outputTokensPerSecond: 120,
    ttftSeconds: 0.4,
    endToEndSeconds: 3.2,
    releaseDate: "2026-09-01",
    measuredAt: NOW,
    matchedBy: "exact",
    ...overrides,
  };
}

test("a lease is exclusive until its owner releases it", async () => {
  const db = await fixture();

  try {
    assert.equal(await syncLeaseHeld(db, NOW), false);
    assert.equal(await claimSyncLease(db, "run-1", LATER), true);
    assert.equal(await syncLeaseHeld(db, NOW), true);
    assert.equal(
      await claimSyncLease(db, "run-2", LATER),
      false,
      "a second holder must be refused",
    );
    assert.equal(
      await releaseSyncLease(db, "run-2"),
      undefined,
      "a non-owner release never throws",
    );
    assert.equal(await syncLeaseHeld(db, NOW), true, "run-1 still holds it");
    await releaseSyncLease(db, "run-1");
    assert.equal(await syncLeaseHeld(db, NOW), false);
    assert.equal(await claimSyncLease(db, "run-2", LATER), true);
  } finally {
    await db.close();
  }
});

test("a completed sync is reported, and a failed one keeps its error", async () => {
  const db = await fixture();

  try {
    await beginSync(db, "run-ok");
    await completeSync(db, {
      runId: "run-ok",
      candidates: 12,
      matched: 9,
      indexVersion: "2026-10",
      quotaRemaining: 40,
    });

    const ok = await latestSuccessfulSync(db);

    assert.equal(ok.finishedAt.endsWith("Z"), true);
    assert.equal(ok.candidates, 12);
    assert.equal(ok.matched, 9);
    assert.equal(ok.indexVersion, "2026-10");
    assert.equal(ok.quotaRemaining, 40);

    await beginSync(db, "run-bad");
    await failSync(db, "run-bad", "quota exhausted", 3);

    const attempt = await latestSyncAttempt(db);

    assert.equal(attempt.status, "failed");
    assert.equal(attempt.error, "quota exhausted");
    assert.equal(Number(attempt.candidates), 3);

    const status = await getBenchmarkStatus(db, 89, false);

    assert.equal(status.syncedAt, ok.finishedAt);
    assert.equal(status.matched, 9);
    assert.equal(status.total, 89);
    assert.equal(status.running, false);
    assert.equal(status.lastError, "quota exhausted");
  } finally {
    await db.close();
  }
});

test("writing benchmarks freshens matches and marks the rest stale", async () => {
  const db = await fixture();

  try {
    await writeBenchmarks(db, [match()], "2026-10");

    assert.equal((await listBenchmarks(db))["model-1"].stale, false);

    await writeBenchmarks(
      db,
      [match({ intelligenceIndex: 50, outputTokensPerSecond: 140 })],
      "2026-11",
    );

    const refreshed = (await listBenchmarks(db))["model-1"];

    assert.equal(refreshed.intelligenceIndex, 50);
    assert.equal(refreshed.indexVersion, "2026-11");
    assert.equal(refreshed.stale, false);

    // A second model that the next sync no longer lists keeps its numbers.
    await writeBenchmarks(db, [], "2026-12");

    const stale = (await listBenchmarks(db))["model-1"];

    assert.equal(stale.stale, true);
    assert.equal(stale.intelligenceIndex, 50, "history must survive a delist");
    assert.equal(
      (await db.prepare("SELECT COUNT(*) AS n FROM model_benchmarks").get()).n,
      1,
    );
    assert.equal(BENCHMARK_SOURCE, "artificial_analysis");
  } finally {
    await db.close();
  }
});

test("the admin epoch increments and reports the value it produced", async () => {
  const db = await fixture();

  try {
    assert.equal(await getAdminSessionEpoch(db), 0);
    assert.equal(await bumpAdminSessionEpoch(db), 1);
    assert.equal(await bumpAdminSessionEpoch(db), 2);
    assert.equal(await getAdminSessionEpoch(db), 2);
  } finally {
    await db.close();
  }
});
