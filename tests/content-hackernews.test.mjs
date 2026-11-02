import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchHackerNewsItems,
  matchHackerNewsStory,
  parseHackerNewsList,
  parseHackerNewsStory,
} from "../lib/content/hackernews.ts";
import {
  hackerNewsStreamFromUrl,
  hackerNewsStreamUrl,
  normalizeHackerNewsUrl,
} from "../lib/content/hackernews-config.ts";
import { ingestSource } from "../lib/content/ingest.ts";
import { createSource } from "../lib/content/store.ts";
import { listItems } from "../lib/content/store/items.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

const TIME = 1_793_577_600;

function story(overrides = {}) {
  return {
    id: 1,
    title: "New AI agent framework",
    externalUrl: null,
    author: "alice",
    publishedAt: "2026-11-02T00:00:00.000Z",
    bodyHtml: null,
    plainBody: "",
    excerpt: "",
    ...overrides,
  };
}

function itemBody(overrides = {}) {
  return JSON.stringify({
    id: 1,
    type: "story",
    title: "New AI agent framework",
    by: "alice",
    time: TIME,
    ...overrides,
  });
}

test("only the public v0 ranked-list endpoints are eligible", () => {
  assert.equal(hackerNewsStreamFromUrl(hackerNewsStreamUrl("top")), "top");
  assert.equal(hackerNewsStreamFromUrl(hackerNewsStreamUrl("show")), "show");
  assert.equal(
    normalizeHackerNewsUrl(
      "https://hacker-news.firebaseio.com/v0/beststories.json",
    ),
    "https://hacker-news.firebaseio.com/v0/beststories.json",
  );
  assert.equal(
    hackerNewsStreamFromUrl("https://example.com/v0/topstories.json"),
    null,
  );
  assert.equal(
    hackerNewsStreamFromUrl(
      "https://hacker-news.firebaseio.com/v0/item/1.json",
    ),
    null,
  );
  assert.equal(
    hackerNewsStreamFromUrl(
      "https://hacker-news.firebaseio.com/v0/topstories.json?x=1",
    ),
    null,
  );
});

test("the stream list validates its root and drops duplicate or bad ids", () => {
  assert.deepEqual(parseHackerNewsList("[1,2,2,\"3\",0,-1,1.5,null]"), [
    1, 2, 3,
  ]);
  assert.deepEqual(parseHackerNewsList("[]"), []);
  assert.throws(() => parseHackerNewsList("{}"), /unexpected list shape/);
  assert.throws(() => parseHackerNewsList("<html>"), /invalid JSON/);
});

test("only live stories with a title and time become HN items", () => {
  const parsed = parseHackerNewsStory(
    itemBody({
      title: "AI <script>alert(1)</script>runtime",
      url: "https://example.com/agent",
      text: "<p>Hello <script>bad()</script><img src=x onerror=alert(1)></p>",
    }),
  );

  assert.equal(parsed.id, 1);
  assert.equal(parsed.externalUrl, "https://example.com/agent");
  assert.equal(parsed.author, "alice");
  assert.equal(parsed.publishedAt, "2026-11-02T00:00:00.000Z");
  assert.doesNotMatch(parsed.title, /<script/i);
  assert.doesNotMatch(parsed.bodyHtml ?? "", /<script|onerror/i);
  assert.doesNotMatch(parsed.excerpt, /<script|onerror/i);

  assert.equal(parseHackerNewsStory(itemBody({ type: "comment" })), null);
  assert.equal(parseHackerNewsStory(itemBody({ type: "poll" })), null);
  assert.equal(parseHackerNewsStory(itemBody({ dead: true })), null);
  assert.equal(parseHackerNewsStory(itemBody({ deleted: true })), null);
  assert.equal(parseHackerNewsStory(itemBody({ title: "  " })), null);
  assert.equal(parseHackerNewsStory(itemBody({ id: "x" })), null);
  assert.equal(parseHackerNewsStory("null"), null);
});

test("the publisher link must be public and must not be the HN thread", () => {
  const unsafe = parseHackerNewsStory(
    itemBody({ url: "javascript:alert(1)" }),
  );
  const loopback = parseHackerNewsStory(
    itemBody({ url: "https://127.0.0.1/private" }),
  );
  const thread = parseHackerNewsStory(
    itemBody({ url: "https://news.ycombinator.com/item?id=99" }),
  );
  const safe = parseHackerNewsStory(
    itemBody({ url: "https://example.com/agent" }),
  );

  assert.equal(unsafe.externalUrl, null);
  assert.equal(loopback.externalUrl, null);
  assert.equal(thread.externalUrl, null);
  assert.equal(safe.externalUrl, "https://example.com/agent");
});

test("the filter accepts title matches and rejects unrelated substrings", () => {
  assert.equal(
    matchHackerNewsStory(story({ title: "New agent framework ships" }), {})
      .accepted,
    true,
  );
  assert.equal(
    matchHackerNewsStory(story({ title: "OpenAI releases a new model" }), {})
      .accepted,
    true,
  );
  assert.equal(
    matchHackerNewsStory(
      story({ title: "Astra can read and write weights to improve Qwen" }),
      {},
    ).accepted,
    true,
  );
  assert.equal(
    matchHackerNewsStory(story({ title: "Local bakery opens downtown" }), {})
      .accepted,
    false,
  );
  assert.equal(
    matchHackerNewsStory(story({ title: "Restraining order issued" }), {})
      .accepted,
    false,
  );
  assert.equal(
    matchHackerNewsStory(story({ title: "Said the actor" }), {}).accepted,
    false,
  );
  assert.equal(
    matchHackerNewsStory(
      story({ title: "Weekly roundup" }),
      {},
    ).accepted,
    false,
  );
});

test("a body-only term needs a second field, and an exclusion vetoes", () => {
  const bodyOnly = story({
    title: "Weekly roundup",
    plainBody: "We discuss inference.",
  });
  const bodyAndUrl = story({
    title: "Weekly roundup",
    plainBody: "We discuss inference.",
    externalUrl: "https://example.com/training",
  });
  const excluded = story({
    title: "AI agent safety roundup",
    plainBody: "We cover OpenAI.",
  });

  assert.equal(matchHackerNewsStory(bodyOnly, {}).accepted, false);
  assert.equal(matchHackerNewsStory(bodyAndUrl, {}).accepted, true);
  assert.equal(
    matchHackerNewsStory(excluded, { excludeTerms: ["safety"] }).accepted,
    false,
  );
  assert.deepEqual(
    matchHackerNewsStory(story({ title: "An LLM inference server" }), {})
      .matchedTerms.includes("llm"),
    true,
  );
});

test("source creation canonicalizes the stream and keeps filter terms", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "hackernews",
      label: "HN best",
      url: "https://hacker-news.firebaseio.com/v0/beststories.json",
      config: {
        tags: ["AI"],
        includeTerms: ["world model", "voice cloning"],
        excludeTerms: ["Hiring"],
      },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 10,
    });

    assert.equal(
      source.url,
      "https://hacker-news.firebaseio.com/v0/beststories.json",
    );
    assert.deepEqual(source.config.includeTerms, [
      "world model",
      "voice cloning",
    ]);
    assert.deepEqual(source.config.excludeTerms, ["hiring"]);

    await assert.rejects(
      createSource(db, {
        kind: "hackernews",
        label: "Not a stream",
        url: "https://example.com/v0/topstories.json",
        config: { tags: [] },
        enabled: true,
        fetchIntervalMinutes: 60,
        maxItems: 10,
      }),
      /known v0 ranked-list URL/,
    );
    await assert.rejects(
      createSource(db, {
        kind: "hackernews",
        label: "Not a list",
        url: "https://hacker-news.firebaseio.com/v0/item/1.json",
        config: { tags: [] },
        enabled: true,
        fetchIntervalMinutes: 60,
        maxItems: 10,
      }),
      /known v0 ranked-list URL/,
    );
  } finally {
    await db.close();
  }
});

const LIST = JSON.stringify([101, 102, 103, 104]);
const STORIES = new Map([
  [
    101,
    {
      id: 101,
      type: "story",
      title: "New AI agent runtime",
      by: "alice",
      time: TIME,
      url: "https://example.com/agent",
    },
  ],
  [
    102,
    {
      id: 102,
      type: "story",
      title: "Local bakery opens downtown",
      by: "bob",
      time: TIME,
    },
  ],
  [103, { id: 103, type: "comment", by: "carol", time: TIME }],
  [
    104,
    {
      id: 104,
      type: "story",
      title: "Show HN: tiny LLM server",
      by: "dave",
      time: TIME,
      text: "<p>An inference server in one file.</p>",
    },
  ],
]);

function hnFetcher(seen = []) {
  return async (url) => {
    if (url.endsWith("topstories.json")) return LIST;

    const id = Number(url.match(/item\/(\d+)\.json/)?.[1]);
    seen.push(id);

    return JSON.stringify(STORIES.get(id));
  };
}

test("HN ingestion stores discussion identity beside the publisher URL", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "hackernews",
      label: "HN top",
      url: hackerNewsStreamUrl("top"),
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 10,
    });
    const result = await ingestSource(db, source, {
      fetchText: hnFetcher(),
      models: [],
      now: () => "2026-11-02T12:00:00.000Z",
    });

    assert.equal(result.ok, true);
    assert.equal(result.itemsSeen, 2);
    assert.equal(result.itemsUpserted, 2);

    const first = await listItems(db, { sourceId: source.id });

    assert.equal(first.total, 2);

    const linked = first.items.find((item) => item.externalId === "101");
    const threadOnly = first.items.find((item) => item.externalId === "104");

    assert.equal(
      linked.url,
      "https://news.ycombinator.com/item?id=101",
    );
    assert.equal(linked.externalUrl, "https://example.com/agent");
    assert.equal(linked.kind, "discussion");
    assert.equal(linked.author, "alice");
    assert.equal(
      threadOnly.url,
      "https://news.ycombinator.com/item?id=104",
    );
    assert.equal(threadOnly.externalUrl, null);
    assert.match(threadOnly.bodyHtml ?? "", /inference server/);

    const again = await ingestSource(db, source, {
      fetchText: hnFetcher(),
      models: [],
      now: () => "2026-11-02T13:00:00.000Z",
    });

    assert.equal(again.ok, true);

    const second = await listItems(db, { sourceId: source.id });

    assert.equal(second.total, 2);
    assert.equal(
      second.items.find((item) => item.externalId === "101").id,
      linked.id,
    );
  } finally {
    await db.close();
  }
});

test("a healthy zero-match window is a successful empty cycle", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "hackernews",
      label: "HN empty",
      url: hackerNewsStreamUrl("new"),
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });
    const result = await ingestSource(db, source, {
      fetchText: async () => "[102]",
      models: [],
      now: () => "2026-11-02T12:00:00.000Z",
    });

    assert.equal(result.ok, true);
    assert.equal(result.itemsSeen, 0);
    assert.equal((await listItems(db, { sourceId: source.id })).total, 0);
  } finally {
    await db.close();
  }
});

test("a malformed root or a fully failed detail window fails the cycle", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    const source = await createSource(db, {
      kind: "hackernews",
      label: "HN failures",
      url: hackerNewsStreamUrl("ask"),
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });
    const malformed = await ingestSource(db, source, {
      fetchText: async () => "{}",
      models: [],
      now: () => "2026-11-02T12:00:00.000Z",
    });
    const failedDetails = await ingestSource(db, source, {
      fetchText: async (url) => {
        if (url.endsWith("askstories.json")) return "[201]";

        throw new Error("item read failed");
      },
      models: [],
      now: () => "2026-11-02T12:00:00.000Z",
    });

    assert.equal(malformed.ok, false);
    assert.match(malformed.error, /unexpected list shape/);
    assert.equal(failedDetails.ok, false);
    assert.match(failedDetails.error, /every candidate/);
  } finally {
    await db.close();
  }
});

test("the candidate detail window is bounded before any item read", async () => {
  const source = {
    id: "src_bounded",
    kind: "hackernews",
    label: "HN bounded",
    url: hackerNewsStreamUrl("best"),
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 10,
    status: "active",
    failureStreak: 0,
    lastFetchedAt: null,
    lastError: null,
    createdAt: "2026-11-02T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
  };
  const ids = Array.from({ length: 120 }, (_value, index) => index + 1);
  const calls = [];

  await fetchHackerNewsItems(source, {
    fetchText: async (url) => {
      if (url.endsWith("beststories.json")) return JSON.stringify(ids);

      const id = Number(url.match(/item\/(\d+)\.json/)?.[1]);

      calls.push(id);

      return JSON.stringify({ id, type: "comment", time: TIME });
    },
  });

  assert.equal(calls.length, 40);
  assert.equal(calls[0], 1);
  assert.equal(calls.at(-1), 40);
});
