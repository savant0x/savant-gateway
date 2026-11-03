import assert from "node:assert/strict";
import test from "node:test";

import {
  metricValue,
  momentumDelta,
  normalizeMomentumMetric,
  normalizeMomentumWindow,
  rankMomentum,
  windowLabel,
} from "../lib/content/momentum.ts";
import {
  createSource,
  listMomentum,
  pruneMetricSnapshots,
  upsertItem,
} from "../lib/content/store.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

function counts(views, likes = 0, comments = 0, stars = 0) {
  return { views, likes, comments, stars };
}

test("momentum math names one metric and keeps zero distinct from absent", () => {
  assert.equal(metricValue(counts(120, 4, 2, 9), "stars"), 9);
  assert.equal(
    momentumDelta("views", counts(100), counts(220)),
    120,
  );
  assert.equal(
    momentumDelta("comments", counts(0, 0, 7), counts(0, 0, 3)),
    -4,
  );
  assert.equal(normalizeMomentumMetric("likes"), "likes");
  assert.equal(normalizeMomentumMetric("popularity"), "views");
  assert.equal(normalizeMomentumWindow("72"), 72);
  assert.equal(normalizeMomentumWindow("1"), 24);
  assert.equal(windowLabel(24), "24 hours");
  assert.equal(windowLabel(72), "3 days");
  assert.equal(windowLabel(168), "7 days");
});

test("rising keeps gains and movers ranks absolute change", () => {
  const entries = [
    { delta: 100, item: { id: "itm_a", title: "Alpha" } },
    { delta: -400, item: { id: "itm_b", title: "Beta" } },
    { delta: 10, item: { id: "itm_c", title: "Charlie" } },
    { delta: 10, item: { id: "itm_d", title: "Delta" } },
    { delta: 0, item: { id: "itm_e", title: "Echo" } },
  ];

  assert.deepEqual(
    rankMomentum(entries, "rising").map((entry) => entry.item.id),
    ["itm_a", "itm_c", "itm_d"],
  );
  assert.deepEqual(
    rankMomentum(entries, "movers").map((entry) => entry.item.id),
    ["itm_b", "itm_a", "itm_c", "itm_d"],
  );
  assert.equal(rankMomentum(entries, "rising", 1).length, 1);
});

test("snapshots, half-open windows, first-snapshot exclusion, and retention", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "rss",
      label: "Momentum feed",
      url: "https://example.com/momentum.xml",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 10,
    });
    const t0 = "2026-11-01T00:00:00.000Z";

    async function store(url, title, views, at) {
      return upsertItem(
        db,
        source,
        {
          externalId: url,
          kind: "article",
          title,
          url,
          excerpt: "Momentum.",
          bodyHtml: null,
          author: null,
          publishedAt: t0,
          thumbnailUrl: null,
          videoId: null,
          tags: [],
          metrics: { views, likes: 0, comments: 0, rating: null },
        },
        at,
      );
    }

    const risingId = await store(
      "https://example.com/momentum/rising",
      "Rising piece",
      100,
      t0,
    );
    await store(
      "https://example.com/momentum/rising",
      "Rising piece",
      100,
      "2026-11-01T01:00:00.000Z",
    );

    const afterUnchanged = await db
      .prepare(
        "SELECT COUNT(*) AS total FROM content.metric_snapshots WHERE item_id = ?",
      )
      .get(risingId);

    assert.equal(Number(afterUnchanged.total), 1);

    await store(
      "https://example.com/momentum/rising",
      "Rising piece",
      250,
      "2026-11-01T02:00:00.000Z",
    );

    const fallingId = await store(
      "https://example.com/momentum/falling",
      "Falling piece",
      500,
      t0,
    );

    await store(
      "https://example.com/momentum/falling",
      "Falling piece",
      100,
      "2026-11-01T02:00:00.000Z",
    );

    await store(
      "https://example.com/momentum/new",
      "New piece",
      900,
      "2026-11-01T02:00:00.000Z",
    );

    const now = new Date("2026-11-02T00:00:00.000Z");
    const rising = await listMomentum(db, {
      metric: "views",
      windowHours: 24,
      mode: "rising",
      now,
    });
    const movers = await listMomentum(db, {
      metric: "views",
      windowHours: 24,
      mode: "movers",
      now,
    });

    assert.deepEqual(
      rising.map((entry) => [entry.item.id, entry.delta]),
      [[risingId, 150]],
    );
    assert.deepEqual(
      movers.map((entry) => [entry.item.id, entry.delta]),
      [
        [fallingId, -400],
        [risingId, 150],
      ],
    );

    const tooEarly = await listMomentum(db, {
      metric: "views",
      windowHours: 24,
      mode: "rising",
      now: new Date("2026-11-01T23:00:00.000Z"),
    });

    assert.equal(tooEarly.length, 0);

    await pruneMetricSnapshots(db, new Date("2027-02-01T00:00:00.000Z"));
    const remaining = await db
      .prepare("SELECT COUNT(*) AS total FROM content.metric_snapshots")
      .get();

    assert.equal(Number(remaining.total), 0);
  } finally {
    await db.close();
  }
});
