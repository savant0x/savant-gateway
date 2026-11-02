import assert from "node:assert/strict";
import test from "node:test";

import { parseFeed, youtubeChannelId } from "../lib/content/feeds.ts";

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Example</title>
    <item>
      <title>GPT-6 Luna launch notes</title>
      <link>/posts/luna</link>
      <description><![CDATA[<p>Hello <strong>world</strong><script>alert(1)</script></p>]]></description>
      <content:encoded><![CDATA[<p>Full body <a href="/x" onclick="bad()">link</a></p>]]></content:encoded>
      <pubDate>Tue, 01 Nov 2026 10:00:00 GMT</pubDate>
      <dc:creator>Ada</dc:creator>
      <category>OpenAI</category>
      <category>gpt-6-luna</category>
      <media:thumbnail url="https://cdn.example.com/thumb.jpg" />
    </item>
  </channel>
</rss>`;

test("RSS items normalize, resolve relative links, and sanitize HTML", () => {
  const [item] = parseFeed(RSS, {
    baseUrl: "https://example.com/feed.xml",
    sourceKind: "rss",
    tags: ["AI"],
    now: "2026-11-02T00:00:00.000Z",
  });

  assert.equal(item.title, "GPT-6 Luna launch notes");
  assert.equal(item.url, "https://example.com/posts/luna");
  assert.equal(item.kind, "article");
  assert.equal(item.author, "Ada");
  assert.equal(item.publishedAt, "2026-11-01T10:00:00.000Z");
  assert.equal(item.thumbnailUrl, "https://cdn.example.com/thumb.jpg");
  assert.deepEqual(item.tags, ["ai", "openai", "gpt-6-luna"]);
  assert.doesNotMatch(item.bodyHtml, /script|onclick/i);
  assert.match(item.bodyHtml, /<p>Full body/);
  assert.match(item.excerpt, /Hello world/);
  assert.doesNotMatch(item.excerpt, /script/);
});

test("Atom video entries map to a video with a thumbnail fallback", () => {
  const atom = `<?xml version="1.0"?>
  <feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
    <entry>
      <title>Building with GPT-6 Luna</title>
      <link rel="alternate" href="https://www.youtube.com/watch?v=abc123" />
      <published>2026-11-01T09:00:00Z</published>
      <author><name>Channel</name></author>
      <yt:videoId>abc123</yt:videoId>
      <media:group xmlns:media="http://search.yahoo.com/mrss/">
        <media:description>Hands-on walkthrough</media:description>
      </media:group>
    </entry>
  </feed>`;

  const [item] = parseFeed(atom, {
    baseUrl: "https://www.youtube.com/feeds/videos.xml?channel_id=UC123",
    sourceKind: "youtube",
    tags: [],
    now: "2026-11-02T00:00:00.000Z",
  });

  assert.equal(item.kind, "video");
  assert.equal(item.videoId, "abc123");
  assert.equal(item.thumbnailUrl, "https://i.ytimg.com/vi/abc123/hqdefault.jpg");
  assert.equal(item.url, "https://www.youtube.com/watch?v=abc123");
});

test("malformed and empty documents return an empty list", () => {
  assert.deepEqual(
    parseFeed("<rss><channel>", {
      baseUrl: "https://example.com/feed",
      sourceKind: "rss",
      tags: [],
    }),
    [],
  );
  assert.deepEqual(
    parseFeed("", {
      baseUrl: "https://example.com/feed",
      sourceKind: "rss",
      tags: [],
    }),
    [],
  );
});

test("relative links that fail the URL policy are dropped", () => {
  const xml = `<rss><channel><item><title>Local</title>
    <link>http://127.0.0.1/secret</link><description>x</description>
  </item></channel></rss>`;

  assert.deepEqual(
    parseFeed(xml, {
      baseUrl: "https://example.com/feed",
      sourceKind: "rss",
      tags: [],
    }),
    [],
  );
});

test("YouTube channel ids and handles are recognized", () => {
  assert.equal(
    youtubeChannelId("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"),
    "UCabcdefghijklmnopqrstuv",
  );
  assert.equal(youtubeChannelId("https://www.youtube.com/@savant"), "@savant");
  assert.equal(youtubeChannelId("@savant"), "@savant");
});
