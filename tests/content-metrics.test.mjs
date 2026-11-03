import assert from "node:assert/strict";
import test from "node:test";

import { parseHackerNewsStory } from "../lib/content/hackernews.ts";
import { parseDailyPapers } from "../lib/content/huggingface.ts";
import {
  createSource,
  listMomentum,
  upsertItem,
} from "../lib/content/store.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

test("Hacker News keeps points and comment counts instead of dropping them", () => {
  const story = parseHackerNewsStory(
    JSON.stringify({
      id: 50351111,
      type: "story",
      title: "An agent framework release",
      time: 1762000000,
      score: 321,
      descendants: 42,
      by: "ada",
      url: "https://example.com/agent-release",
    }),
  );

  assert.ok(story);
  assert.equal(story.score, 321);
  assert.equal(story.comments, 42);

  const malformed = parseHackerNewsStory(
    JSON.stringify({
      id: 50351112,
      type: "story",
      title: "No counts",
      time: 1762000000,
      score: "many",
      descendants: -1,
    }),
  );

  assert.ok(malformed);
  assert.equal(malformed.score, null);
  assert.equal(malformed.comments, null);
});

test("HuggingFace daily papers map upvotes and ignore malformed counts", () => {
  const items = parseDailyPapers(
    JSON.stringify([
      {
        paper: {
          id: "2610.38623",
          title: "A useful paper",
          summary: "Summary.",
          authors: [{ name: "Ada" }],
          upvotes: 17,
          publishedAt: "2026-11-03T00:00:00.000Z",
        },
      },
      {
        paper: {
          id: "2610.38624",
          title: "No upvotes",
          summary: "Summary.",
          authors: [],
          upvotes: "lots",
          publishedAt: "2026-11-03T00:00:00.000Z",
        },
      },
    ]),
    10,
  );

  assert.equal(items[0].metrics.likes, 17);
  assert.equal(items[0].metrics.comments, 0);
  assert.equal(items[1].metrics, undefined);
});

test("snapshots store a source-neutral comment column and rank likes", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "rss",
      label: "Metrics feed",
      url: "https://example.com/metrics.xml",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 10,
    });
    const t0 = "2026-11-01T00:00:00.000Z";

    async function store(likes, comments, at) {
      return upsertItem(
        db,
        source,
        {
          externalId: "metrics",
          kind: "article",
          title: "Measured item",
          url: "https://example.com/metrics/item",
          excerpt: "Measured.",
          bodyHtml: null,
          author: null,
          publishedAt: t0,
          thumbnailUrl: null,
          videoId: null,
          tags: [],
          metrics: { views: 0, likes, comments, rating: null },
        },
        at,
      );
    }

    const itemId = await store(50, 12, t0);

    await store(80, 20, "2026-11-01T01:00:00.000Z");

    const snapshots = await db
      .prepare(
        `SELECT likes, comments FROM content.metric_snapshots
          WHERE item_id = ? ORDER BY captured_at ASC`,
      )
      .all(itemId);

    assert.deepEqual(
      snapshots.map((row) => [Number(row.likes), Number(row.comments)]),
      [
        [50, 12],
        [80, 20],
      ],
    );

    const rising = await listMomentum(db, {
      metric: "likes",
      windowHours: 24,
      mode: "rising",
      now: new Date("2026-11-02T00:30:00.000Z"),
    });

    assert.equal(rising.length, 1);
    assert.equal(rising[0].delta, 30);
    assert.equal(rising[0].current, 80);
    assert.equal(rising[0].baseline, 50);
  } finally {
    await db.close();
  }
});
