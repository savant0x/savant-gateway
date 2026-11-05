import assert from "node:assert/strict";
import test from "node:test";

import {
  ingestDueSourcesBounded,
  ingestSource,
} from "../lib/content/ingest.ts";
import {
  contentStats,
  listRecentCycles,
} from "../lib/content/store/cycles.ts";
import { getSource } from "../lib/content/store/sources.ts";
import { claimSource } from "../lib/content/store/claims.ts";
import {
  acceptAutoLink,
  createSource,
  listContentForModel,
  listItems,
} from "../lib/content/store.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

const MODEL_ID = "free/gpt-6-luna";

const FEED = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>GPT-6 Luna launch notes</title>
    <link>https://example.com/luna</link>
    <description><![CDATA[<p>Release coverage.</p>]]></description>
    <pubDate>Sun, 02 Nov 2026 10:00:00 GMT</pubDate>
    <category>OpenAI</category>
  </item>
</channel></rss>`;

const YOUTUBE_FEED = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns:media="http://search.yahoo.com/mrss/">
  <entry>
    <title>GPT-6 Luna benchmark walkthrough</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=vid123" />
    <published>2026-11-02T09:00:00Z</published>
    <author><name>Channel</name></author>
    <yt:videoId>vid123</yt:videoId>
    <media:group>
      <media:description><![CDATA[Line one.

Second paragraph.]]></media:description>
      <media:community>
        <media:starRating average="4.5" count="20" />
        <media:statistics views="1000" />
      </media:community>
    </media:group>
  </entry>
</feed>`;

async function seedModel(db) {
  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, name, provider, family, context_window, token_weight,
         input_price_micros, output_price_micros, allow_free, supports_tools,
         supports_vision, status, sort_order, synced_at, in_catalog)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, 1)`,
    )
    .run(
      MODEL_ID,
      "gpt-6-luna",
      "GPT-6 Luna",
      "GPT",
      "GPT",
      "128000",
      1,
      0,
      0,
      1,
      0,
      0,
      "2026-11-02T00:00:00.000Z",
    );
}

test("ingestion stores the item, tag, cycle, and review-required link", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    await seedModel(db);
    const source = await createSource(db, {
      kind: "rss",
      label: "Fixture",
      url: "https://example.com/feed.xml",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });

    const result = await ingestSource(db, source, {
      fetchText: async () => FEED,
      now: () => "2026-11-02T12:00:00.000Z",
      models: [
        {
          id: MODEL_ID,
          name: "GPT-6 Luna",
          family: "GPT",
          upstreamId: "gpt-6-luna",
        },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.itemsSeen, 1);
    assert.equal(result.itemsUpserted, 1);

    const pending = await listContentForModel(db, MODEL_ID);
    const pendingStats = await contentStats(db);

    assert.equal(pending.items.length, 0);
    assert.equal(pendingStats.items, 1);
    assert.equal(pendingStats.linkedItems, 0);

    const item = (await listItems(db, { sourceId: source.id })).items[0];

    assert.equal(await acceptAutoLink(db, item.id, MODEL_ID), true);

    const coverage = await listContentForModel(db, MODEL_ID);
    const stats = await contentStats(db);

    assert.equal(coverage.items.length, 1);
    assert.equal(coverage.items[0].relation, "release");
    assert.equal(stats.linkedItems, 1);

    const refreshed = await getSource(db, source.id);
    assert.equal(refreshed.status, "active");
    assert.equal(refreshed.failureStreak, 0);
    assert.equal(refreshed.lastFetchedAt, "2026-11-02T12:00:00.000Z");
  } finally {
    await db.close();
  }
});

test("YouTube ingestion merges Data API likes and comment counts", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "youtube",
      label: "Channel",
      url: "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv",
      config: { tags: [], channelId: "UCabcdefghijklmnopqrstuv" },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });
    const calls = [];

    const result = await ingestSource(db, source, {
      apiKey: "test-key",
      fetchText: async (url) => {
        calls.push(url);

        if (url.startsWith("https://www.googleapis.com/youtube/v3/videos")) {
          return JSON.stringify({
            items: [
              {
                id: "vid123",
                statistics: {
                  viewCount: "12345",
                  likeCount: "678",
                  commentCount: "90",
                },
              },
            ],
          });
        }

        return YOUTUBE_FEED;
      },
      now: () => "2026-11-02T12:00:00.000Z",
      models: [],
    });

    assert.equal(result.ok, true);
    assert.ok(calls.some((url) => url.includes("part=statistics")));

    const page = await listItems(db, { sourceId: source.id });
    const item = page.items[0];

    assert.equal(item.videoId, "vid123");
    assert.match(item.bodyHtml, /<p>Line one\.<\/p>/);
    assert.match(item.bodyHtml, /<p>Second paragraph\.<\/p>/);
    assert.deepEqual(item.metrics, {
      views: 12345,
      likes: 678,
      comments: 90,
      rating: 4.5,
    });
  } finally {
    await db.close();
  }
});

test("a zero deadline stops the run before starting a source", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    await createSource(db, {
      kind: "rss",
      label: "Due but past deadline",
      url: "https://example.com/deadline.xml",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });
    let fetches = 0;
    const run = await ingestDueSourcesBounded(
      db,
      {
        fetchText: async () => {
          fetches += 1;

          return FEED;
        },
        now: () => "2026-11-02T12:00:00.000Z",
        clock: () => 1_000,
        models: [],
      },
      { deadlineMs: 0 },
    );

    assert.equal(run.deadlineReached, true);
    assert.equal(run.results.length, 0);
    assert.equal(run.claimed, 0);
    assert.equal(run.skipped, 1);
    assert.equal(fetches, 0);
  } finally {
    await db.close();
  }
});

test("a source claimed by another owner is skipped, not duplicated", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "rss",
      label: "Held",
      url: "https://example.com/held.xml",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });

    assert.equal(
      await claimSource(db, {
        sourceId: source.id,
        owner: "other-run",
        at: "2026-11-02T12:00:00.000Z",
        expiresAt: "2026-11-02T12:10:00.000Z",
      }),
      true,
    );

    let fetches = 0;
    const run = await ingestDueSourcesBounded(
      db,
      {
        fetchText: async () => {
          fetches += 1;

          return FEED;
        },
        now: () => "2026-11-02T12:00:00.000Z",
        clock: () => Date.parse("2026-11-02T12:00:01.000Z"),
        models: [],
      },
      { owner: "this-run" },
    );

    assert.equal(run.results.length, 0);
    assert.equal(run.claimed, 0);
    assert.equal(run.skipped, 1);
    assert.equal(fetches, 0);
  } finally {
    await db.close();
  }
});

test("an expired claim is reclaimed and released after a successful run", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "rss",
      label: "Expired lease",
      url: "https://example.com/expired.xml",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });

    await claimSource(db, {
      sourceId: source.id,
      owner: "dead-run",
      at: "2026-11-02T11:00:00.000Z",
      expiresAt: "2026-11-02T11:10:00.000Z",
    });

    const run = await ingestDueSourcesBounded(
      db,
      {
        fetchText: async () => FEED,
        now: () => "2026-11-02T12:00:00.000Z",
        clock: () => Date.parse("2026-11-02T12:00:00.000Z"),
        models: [],
      },
      { owner: "new-run" },
    );

    assert.equal(run.results.length, 1);
    assert.equal(run.results[0].ok, true);
    assert.equal(run.claimed, 1);

    const held = await db
      .prepare("SELECT COUNT(*) AS count FROM content.ingest_claims")
      .get();

    assert.equal(Number(held.count), 0);
  } finally {
    await db.close();
  }
});

test("a parsed cycle records dropped entries", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "rss",
      label: "Partly malformed feed",
      url: "https://example.com/partial.xml",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 10,
    });
    const result = await ingestSource(db, source, {
      fetchText: async () =>
        `<?xml version="1.0"?>
         <rss version="2.0"><channel>
           <item><title>Valid</title><link>https://example.com/valid</link></item>
           <item><title></title><link>https://example.com/no-title</link></item>
         </channel></rss>`,
      now: () => "2026-11-02T12:00:00.000Z",
      models: [],
    });

    assert.equal(result.ok, true);
    assert.equal(result.itemsSeen, 1);
    assert.equal(result.itemsSkipped, 1);

    const cycles = await listRecentCycles(db, 5);

    assert.equal(cycles[0].itemsSkipped, 1);
  } finally {
    await db.close();
  }
});

test("a configuration failure stays visible without disabling the source", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "youtube",
      label: "Misconfigured channel",
      url: "https://example.com/not-a-channel",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });
    let fetched = false;
    const result = await ingestSource(db, source, {
      fetchText: async () => {
        fetched = true;

        return "unexpected";
      },
      now: () => "2026-11-02T12:00:00.000Z",
      models: [],
    });

    assert.equal(fetched, false);
    assert.equal(result.ok, false);
    assert.equal(result.failureKind, "config");
    assert.match(result.error, /channel id or URL/);

    const current = await getSource(db, source.id);

    assert.equal(current.failureStreak, 0);
    assert.equal(current.status, "error");
    assert.equal(current.enabled, true);
  } finally {
    await db.close();
  }
});

test("a YouTube handle resolves without a Data API key", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "youtube",
      label: "@handle",
      url: "https://www.youtube.com/@handle",
      config: { tags: [], channelId: "@handle" },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });
    const calls = [];

    const result = await ingestSource(db, source, {
      apiKey: null,
      fetchText: async (url) => {
        calls.push(url);

        if (url === "https://www.youtube.com/@handle") {
          return '<meta content="https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv">';
        }

        return YOUTUBE_FEED;
      },
      now: () => "2026-11-02T12:00:00.000Z",
      models: [],
    });

    assert.equal(result.ok, true);
    assert.equal(result.itemsUpserted, 1);
    assert.ok(calls.includes("https://www.youtube.com/@handle"));
    assert.ok(
      calls.some((url) =>
        url.startsWith(
          "https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv",
        ),
      ),
    );
    assert.ok(!calls.some((url) => url.startsWith("https://www.googleapis.com")));

    const item = (await listItems(db, { sourceId: source.id })).items[0];

    assert.equal(item.videoId, "vid123");
  } finally {
    await db.close();
  }
});

test("a failed statistics call keeps the feed metrics and the cycle", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "youtube",
      label: "Channel",
      url: "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv",
      config: { tags: [], channelId: "UCabcdefghijklmnopqrstuv" },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });

    const result = await ingestSource(db, source, {
      apiKey: "test-key",
      fetchText: async (url) => {
        if (url.startsWith("https://www.googleapis.com/youtube/v3/videos")) {
          throw new Error("quota exhausted");
        }

        return YOUTUBE_FEED;
      },
      now: () => "2026-11-02T12:00:00.000Z",
      models: [],
    });

    assert.equal(result.ok, true);

    const item = (await listItems(db, { sourceId: source.id })).items[0];

    assert.deepEqual(item.metrics, {
      views: 1000,
      likes: 0,
      comments: 0,
      rating: 4.5,
    });
  } finally {
    await db.close();
  }
});

test("a failing source records the error and disables after five attempts", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "rss",
      label: "Broken",
      url: "https://example.com/broken.xml",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await ingestSource(db, source, {
        fetchText: async () => {
          throw new Error("upstream timeout");
        },
        now: () => "2026-11-02T12:00:00.000Z",
        models: [],
      });

      assert.equal(result.ok, false);
      assert.match(result.error, /upstream timeout/);

      const current = await getSource(db, source.id);

      assert.equal(current.failureStreak, attempt);
      assert.equal(current.status, attempt < 5 ? "error" : "disabled");
      assert.equal(current.enabled, attempt < 5);
    }
  } finally {
    await db.close();
  }
});
