import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDigestFeed,
  buildStatusBadge,
  DIGEST_FEED_DAYS,
  escapeXml,
  parseFeedDays,
} from "../lib/content/distribution.ts";

const NOW = new Date("2026-11-03T12:00:00.000Z");

function item(overrides = {}) {
  return {
    id: "art_1",
    sourceId: "src_1",
    sourceLabel: "Example & Co",
    kind: "article",
    title: "Luna <script>alert(1)</script> & friends",
    url: "https://example.com/post",
    externalUrl: null,
    excerpt: "A <b>bold</b> claim & a caveat.",
    bodyHtml: null,
    author: null,
    publishedAt: "2026-11-03T09:00:00.000Z",
    fetchedAt: "2026-11-03T09:30:00.000Z",
    thumbnailUrl: null,
    videoId: null,
    externalId: null,
    tags: ["openai", "safety"],
    metrics: { views: 0, likes: 0, comments: 0, rating: null },
    github: null,
    ...overrides,
  };
}

function source(overrides = {}) {
  return {
    id: "src_1",
    label: "Example",
    kind: "rss",
    enabled: true,
    status: "active",
    failureStreak: 0,
    lastFetchedAt: "2026-11-03T11:50:00.000Z",
    lastSuccessAt: "2026-11-03T11:50:00.000Z",
    fetchIntervalMinutes: 60,
    ...overrides,
  };
}

test("feed days default and stay inside the published window", () => {
  assert.equal(parseFeedDays(null), DIGEST_FEED_DAYS.default);
  assert.equal(parseFeedDays(""), DIGEST_FEED_DAYS.default);
  assert.equal(parseFeedDays("abc"), DIGEST_FEED_DAYS.default);
  assert.equal(parseFeedDays("7"), 7);
  assert.equal(parseFeedDays("0"), DIGEST_FEED_DAYS.min);
  assert.equal(parseFeedDays("-4"), DIGEST_FEED_DAYS.min);
  assert.equal(parseFeedDays("99"), DIGEST_FEED_DAYS.max);
  assert.equal(parseFeedDays("2.5"), DIGEST_FEED_DAYS.default);
});

test("digest feed escapes publisher text and points at the Signal item", () => {
  const feed = buildDigestFeed({
    items: [item()],
    origin: "https://savant.example/",
    days: 14,
    generatedAt: NOW,
  });

  assert.match(feed, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(feed, /<rss version="2.0"/);
  assert.match(feed, /<link>https:\/\/savant\.example\/signal\/art_1<\/link>/);
  assert.match(feed, /<guid isPermaLink="false">art_1<\/guid>/);
  assert.match(feed, /Example &amp; Co/);
  assert.match(feed, /Luna &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; friends/);
  assert.match(feed, /A &lt;b&gt;bold&lt;\/b&gt; claim &amp; a caveat\./);
  assert.match(feed, /<pubDate>Tue, 03 Nov 2026 09:00:00 GMT<\/pubDate>/);
  assert.match(feed, /<atom:link href="https:\/\/savant\.example\/signal\/digest\/feed\.xml\?days=14"/);
  assert.equal(feed.includes("<script>"), false);
  assert.equal(escapeXml("'\"&<>"), "&apos;&quot;&amp;&lt;&gt;");
});

test("digest feed omits an invalid publication date instead of inventing one", () => {
  const feed = buildDigestFeed({
    items: [item({ publishedAt: "not-a-date" })],
    origin: "https://savant.example",
    days: 1,
    generatedAt: NOW,
  });

  assert.equal(feed.includes("<pubDate>"), false);
});

test("status badge reports the public projection, never a private reason", () => {
  assert.deepEqual(buildStatusBadge([], NOW), {
    schemaVersion: 1,
    label: "signal",
    message: "no sources",
    color: "lightgrey",
  });

  assert.equal(buildStatusBadge([source()], NOW).color, "brightgreen");
  assert.equal(buildStatusBadge([source()], NOW).message, "1/1 current");

  const delayed = buildStatusBadge(
    [source({ lastSuccessAt: null }), source({ id: "src_2" })],
    NOW,
  );

  assert.equal(delayed.color, "yellow");
  assert.equal(delayed.message, "1 delayed");

  assert.equal(
    buildStatusBadge([source({ status: "error" })], NOW).color,
    "red",
  );
  assert.equal(
    buildStatusBadge([source({ enabled: false })], NOW).message,
    "paused",
  );
  assert.equal(
    buildStatusBadge(
      [
        source({ status: "error" }),
        source({ id: "src_2", lastSuccessAt: null }),
      ],
      NOW,
    ).color,
    "red",
  );
});
