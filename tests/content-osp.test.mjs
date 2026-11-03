import assert from "node:assert/strict";
import test from "node:test";

import { ingestSource } from "../lib/content/ingest.ts";
import {
  enrichOspImpressions,
  isOspPostUrl,
  parseOspImpressions,
} from "../lib/content/osp-impressions.ts";
import { createSource, listItems } from "../lib/content/store.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

function item(url, views = 0) {
  return {
    externalId: url,
    kind: "repo",
    title: "A project",
    url,
    excerpt: "Project.",
    bodyHtml: null,
    author: null,
    publishedAt: "2026-11-03T00:00:00.000Z",
    thumbnailUrl: null,
    videoId: null,
    tags: ["repository"],
    metrics: { views, likes: 3, comments: 1, rating: null },
  };
}

test("only OSP post pages are eligible", () => {
  assert.equal(
    isOspPostUrl("https://www.opensourceprojects.dev/post/router"),
    true,
  );
  assert.equal(
    isOspPostUrl("https://opensourceprojects.dev/post/router"),
    true,
  );
  assert.equal(
    isOspPostUrl("https://www.opensourceprojects.dev/?sort=views"),
    false,
  );
  assert.equal(isOspPostUrl("https://example.com/post/router"), false);
  assert.equal(isOspPostUrl("not a url"), false);
});

test("the impressions marker parses without script text", () => {
  assert.equal(parseOspImpressions("<p>Impressions 41</p>"), 41);
  assert.equal(parseOspImpressions("<span>Impressions 1,204</span>"), 1204);
  assert.equal(parseOspImpressions("<p>No marker here</p>"), null);
  assert.equal(
    parseOspImpressions(
      "<script>const label = 'Impressions 999';</script><p>None</p>",
    ),
    null,
  );
});

test("enrichment is bounded, isolated and preserves other metrics", async () => {
  const calls = [];
  const items = [
    item("https://www.opensourceprojects.dev/post/one"),
    item("https://www.opensourceprojects.dev/post/fails", 7),
    item("https://www.opensourceprojects.dev/post/plain", 2),
    item("https://example.com/post/foreign"),
  ];
  const applied = await enrichOspImpressions(
    items,
    async (url) => {
      calls.push(url);

      if (url.endsWith("/fails")) throw new Error("upstream timeout");
      if (url.endsWith("/plain")) return "<p>No marker here</p>";

      return "<p>Impressions 88</p>";
    },
    2,
  );

  assert.equal(applied, 1);
  assert.equal(calls.length, 2);
  assert.equal(items[0].metrics.views, 88);
  assert.equal(items[0].metrics.likes, 3);
  assert.equal(items[1].metrics.views, 7);
  assert.equal(items[2].metrics.views, 2);
});

test("ingestion stores impressions for an OSP feed item", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "rss",
      label: "Open Source Projects",
      url: "https://www.opensourceprojects.dev/rss",
      config: { tags: ["repository"] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 10,
    });
    const feed = `<?xml version="1.0"?>
      <rss version="2.0"><channel><title>OSP</title>
        <item>
          <title>acme/router</title>
          <link>https://www.opensourceprojects.dev/post/router</link>
          <description>A router.</description>
          <pubDate>Mon, 02 Nov 2026 00:00:00 GMT</pubDate>
          <guid>osp-router</guid>
        </item>
      </channel></rss>`;
    const calls = [];
    const result = await ingestSource(db, source, {
      fetchText: async (url) => {
        calls.push(url);

        if (url.endsWith("/rss")) return feed;

        return "<p>Impressions 77</p>";
      },
      now: () => "2026-11-03T12:00:00.000Z",
      models: [],
      fetchGithub: async () => null,
    });

    assert.equal(result.ok, true);
    assert.ok(calls.includes("https://www.opensourceprojects.dev/post/router"));

    const stored = (await listItems(db, { sourceId: source.id })).items[0];

    assert.equal(stored.metrics.views, 77);
  } finally {
    await db.close();
  }
});
