import assert from "node:assert/strict";
import test from "node:test";

import { ingestSource } from "../lib/content/ingest.ts";
import { contentStats } from "../lib/content/store/cycles.ts";
import { getSource } from "../lib/content/store/sources.ts";
import {
  createSource,
  listContentForModel,
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

test("ingestion stores the item, tag, cycle, and reviewed model link", async () => {
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

    const coverage = await listContentForModel(db, MODEL_ID);
    const stats = await contentStats(db);

    assert.equal(coverage.items.length, 1);
    assert.equal(coverage.items[0].relation, "release");
    assert.equal(stats.items, 1);
    assert.equal(stats.linkedItems, 1);

    const refreshed = await getSource(db, source.id);
    assert.equal(refreshed.status, "active");
    assert.equal(refreshed.failureStreak, 0);
    assert.equal(refreshed.lastFetchedAt, "2026-11-02T12:00:00.000Z");
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
