import assert from "node:assert/strict";
import test from "node:test";

import {
  automationHealth,
  defaultAutomationPolicy,
  parseAutomationPolicy,
} from "../lib/content/automation.ts";
import { IngestBudget } from "../lib/content/budget.ts";
import { ingestSource } from "../lib/content/ingest.ts";
import { ingestDueSourcesBounded } from "../lib/content/ingest.ts";
import {
  automationSnapshot,
  listFetchRuns,
  readAutomationPolicy,
  saveAutomationPolicy,
} from "../lib/content/store/automation.ts";
import { readSourceCheckpoint } from "../lib/content/store/source-checkpoints.ts";
import { createSource, getSource } from "../lib/content/store/sources.ts";
import { contentStats } from "../lib/content/store/cycles.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

const FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Run receipt fixture</title>
    <link>https://example.com/run-receipt</link>
    <description>Fixture body.</description>
    <pubDate>Sun, 02 Nov 2026 10:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

async function source(db, label = "Automation fixture") {
  return createSource(db, {
    kind: "rss",
    label,
    url: `https://example.com/${label.replaceAll(" ", "-")}.xml`,
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 5,
  });
}

test("automation policy round-trips with revision conflicts and closed defaults", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const initial = await readAutomationPolicy(db, {});
    assert.equal(initial.error, null);
    assert.equal(initial.policy.enabled, false);
    assert.equal(initial.policy.revision, 0);

    const saved = await saveAutomationPolicy(
      db,
      {
        enabled: true,
        batchLimit: 12,
        heartbeatMinutes: 7,
        expectedRevision: 0,
      },
      {},
    );

    assert.equal(saved.ok, true);
    assert.equal(saved.policy.revision, 1);
    assert.equal(saved.policy.batchLimit, 12);

    const reread = await readAutomationPolicy(db, {});
    assert.equal(reread.policy.enabled, true);
    assert.equal(reread.policy.heartbeatMinutes, 7);

    const stale = await saveAutomationPolicy(
      db,
      { enabled: false, expectedRevision: 0 },
      {},
    );
    assert.equal(stale.ok, false);
    assert.equal(stale.status, 409);

    const invalid = await saveAutomationPolicy(
      db,
      { batchLimit: 0, expectedRevision: 1 },
      {},
    );
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, 400);

    assert.equal(parseAutomationPolicy("{broken", {}).ok, false);
    assert.equal(
      defaultAutomationPolicy({ CONTENT_INGEST_ENABLED: "true" }).enabled,
      true,
    );
  } finally {
    await db.close();
  }
});

test("attempt and success clocks stay separate across a failure", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const fixture = await source(db, "Clock fixture");

    const failed = await ingestSource(
      db,
      fixture,
      {
        fetchText: async () => {
          throw new Error("upstream unavailable");
        },
        now: () => "2026-11-04T10:00:00.000Z",
        models: [],
      },
    );

    assert.equal(failed.ok, false);

    const afterFailure = await getSource(db, fixture.id);
    assert.equal(afterFailure.lastFetchedAt, "2026-11-04T10:00:00.000Z");
    assert.equal(afterFailure.lastSuccessAt, null);

    const succeeded = await ingestSource(
      db,
      fixture,
      {
        fetchText: async () => FEED,
        now: () => "2026-11-04T11:00:00.000Z",
        models: [],
      },
    );

    assert.equal(succeeded.ok, true);

    const afterSuccess = await getSource(db, fixture.id);
    assert.equal(afterSuccess.lastFetchedAt, "2026-11-04T11:00:00.000Z");
    assert.equal(afterSuccess.lastSuccessAt, "2026-11-04T11:00:00.000Z");

    const stats = await contentStats(db);
    assert.equal(stats.lastFetchedAt, "2026-11-04T11:00:00.000Z");
    assert.equal(stats.lastSuccessAt, "2026-11-04T11:00:00.000Z");
  } finally {
    await db.close();
  }
});

test("a budget pause stores a checkpoint and the next attempt resumes it", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const fixture = await source(db, "Checkpoint fixture");
    let tick = 1_000;
    const clock = () => tick;
    const paused = await ingestSource(
      db,
      fixture,
      {
        fetchText: async () => {
          tick += 5_000;
          return FEED;
        },
        now: () => "2026-11-04T12:00:00.000Z",
        clock,
        models: [],
      },
      { budget: new IngestBudget(100, clock) },
    );

    assert.equal(paused.paused, true);
    assert.equal(paused.itemsUpserted, 0);

    const checkpoint = await readSourceCheckpoint(db, fixture.id);
    assert.ok(checkpoint);
    assert.equal(checkpoint.nextIndex, 0);
    assert.equal(checkpoint.items.length, 1);

    const stalled = await getSource(db, fixture.id);
    assert.equal(stalled.lastSuccessAt, null);
    assert.equal(stalled.lastFetchedAt, null);

    const resumed = await ingestSource(
      db,
      fixture,
      {
        fetchText: async () => {
          throw new Error("resume must not fetch again");
        },
        now: () => "2026-11-04T12:01:00.000Z",
        models: [],
      },
      { resume: checkpoint },
    );

    assert.equal(resumed.ok, true);
    assert.equal(resumed.itemsUpserted, 1);
    assert.equal(await readSourceCheckpoint(db, fixture.id), null);

    const completed = await getSource(db, fixture.id);
    assert.equal(completed.lastSuccessAt, "2026-11-04T12:01:00.000Z");
  } finally {
    await db.close();
  }
});

test("a bounded run records its durable counts and health", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    await source(db, "Run fixture");
    const run = await ingestDueSourcesBounded(
      db,
      {
        fetchText: async () => FEED,
        now: () => "2026-11-04T13:00:00.000Z",
        clock: () => Date.parse("2026-11-04T13:00:00.000Z"),
        models: [],
      },
      { trigger: "scheduled", limit: 5, deadlineMs: 10_000 },
    );

    assert.equal(run.status, "ok");
    assert.equal(run.claimed, 1);
    assert.equal(run.results[0].ok, true);

    const runs = await listFetchRuns(db, { limit: "5" });
    assert.equal(runs.runs[0].id, run.runId);
    assert.equal(runs.runs[0].sourcesClaimed, 1);
    assert.equal(runs.runs[0].sourcesOk, 1);

    const snapshot = await automationSnapshot(db, {});
    assert.equal(snapshot.lastRun.id, run.runId);
    assert.equal(snapshot.lastSuccessAt, "2026-11-04T13:00:00.000Z");

    const health = automationHealth(
      { ...snapshot.policy, enabled: true, heartbeatMinutes: 5 },
      snapshot.lastRun,
      true,
      0,
      new Date("2026-11-04T13:01:00.000Z"),
    );
    assert.equal(health.state, "healthy");

    const overdue = automationHealth(
      { ...snapshot.policy, enabled: true, heartbeatMinutes: 5 },
      snapshot.lastRun,
      true,
      0,
      new Date("2026-11-04T13:20:00.000Z"),
    );
    assert.equal(overdue.state, "overdue");
  } finally {
    await db.close();
  }
});
