import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTENT_SEARCH_LIMITS,
  parseSearchQuery,
} from "../lib/content/search.ts";
import {
  resetSearchRateLimit,
  SEARCH_RATE_LIMIT,
  searchClientKey,
  takeSearchToken,
} from "../lib/content/search-limit.ts";
import {
  createSource,
  listItems,
  listTags,
  searchModels,
  upsertItem,
} from "../lib/content/store.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

test("search limiter allows one burst, refuses the next request, and refills", () => {
  resetSearchRateLimit();

  const now = Date.parse("2026-11-03T12:00:00.000Z");

  for (let index = 0; index < SEARCH_RATE_LIMIT.capacity; index += 1) {
    assert.equal(takeSearchToken("203.0.113.9", now).allowed, true);
  }

  const refused = takeSearchToken("203.0.113.9", now);

  assert.equal(refused.allowed, false);
  assert.equal(refused.remaining, 0);
  assert.equal(refused.retryAfterSeconds >= 1, true);

  // Another client has its own bucket.
  assert.equal(takeSearchToken("203.0.113.10", now).allowed, true);

  // A full minute refills at the sustained rate, capped at the burst size.
  assert.equal(takeSearchToken("203.0.113.9", now + 60_000).allowed, true);

  resetSearchRateLimit();
});

test("search client identity reads only the configured trusted header", () => {
  const headers = new Headers({
    "x-forwarded-for": "198.51.100.7, 10.0.0.1",
    "x-real-ip": "198.51.100.8",
  });
  const request = new Request("https://example.com", { headers });

  // Blank setting: every caller shares one bucket, so a spoofed header cannot
  // earn a fresh allowance.
  assert.equal(searchClientKey(request, {}), "untrusted-client");
  assert.equal(
    searchClientKey(request, {
      GATEWAY_TRUSTED_IP_HEADER: "x-real-ip",
    }),
    "198.51.100.8",
  );
  assert.equal(
    searchClientKey(
      new Request("https://example.com", {
        headers: { "x-forwarded-for": "not-an-ip" },
      }),
      { GATEWAY_TRUSTED_IP_HEADER: "x-real-ip" },
    ),
    "untrusted-client",
  );
});

test("search rejects short, empty, and overlong queries and trims whitespace", () => {
  assert.equal(parseSearchQuery(null).ok, false);
  assert.equal(parseSearchQuery("   ").ok, false);
  assert.equal(parseSearchQuery("a").ok, false);

  const trimmed = parseSearchQuery("  luna  ");

  assert.equal(trimmed.ok, true);
  assert.equal(trimmed.query, "luna");

  const maximum = "x".repeat(CONTENT_SEARCH_LIMITS.maxChars);

  assert.equal(parseSearchQuery(maximum).ok, true);
  assert.equal(
    parseSearchQuery(`${maximum}x`).ok,
    false,
  );
});

test("search caps items, models and topics and excludes unpublished rows", async () => {
  const db = await createStorageDatabase({ env: {} });

  try {
    for (let index = 0; index < 6; index += 1) {
      await db
        .prepare(
          `INSERT INTO models
            (id, upstream_id, name, provider, family, context_window,
             token_weight, input_price_micros, output_price_micros,
             allow_free, supports_tools, supports_vision, status, sort_order,
             synced_at, in_catalog)
           VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, 0, 0, 0, ?, 0, ?, ?)`,
        )
        .run(
          `free/luna-${index}`,
          `luna-${index}`,
          `Luna ${index}`,
          "Luna",
          "Luna",
          "128000",
          index === 5 ? "disabled" : "active",
          "2026-11-03T00:00:00.000Z",
          index === 4 ? 0 : 1,
        );
    }

    const models = await searchModels(db, "luna", 3);

    assert.equal(models.length, 3);
    assert.deepEqual(
      models.map((model) => model.name),
      ["Luna 0", "Luna 1", "Luna 2"],
    );
    assert.equal(
      (await searchModels(db, "luna", 10)).some(
        (model) => model.id === "free/luna-5",
      ),
      false,
    );
    assert.equal(
      (await searchModels(db, "luna", 10)).some(
        (model) => model.id === "free/luna-4",
      ),
      false,
    );

    const source = await createSource(db, {
      kind: "rss",
      label: "Search feed",
      url: "https://example.com/search.xml",
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 10,
    });

    for (let index = 0; index < 6; index += 1) {
      await upsertItem(
        db,
        source,
        {
          externalId: `search-${index}`,
          kind: "article",
          title: `Luna search piece ${index}`,
          url: `https://example.com/search/${index}`,
          excerpt: "Search target.",
          bodyHtml: null,
          author: null,
          publishedAt: "2026-11-03T09:00:00.000Z",
          thumbnailUrl: null,
          videoId: null,
          tags: ["openai", "luna-topic"],
        },
        "2026-11-03T09:30:00.000Z",
      );
    }

    const page = await listItems(db, { search: "Luna", limit: 5 });

    assert.equal(page.total, 6);
    assert.equal(page.items.length, CONTENT_SEARCH_LIMITS.itemLimit);

    const topics = await listTags(db, CONTENT_SEARCH_LIMITS.topicLimit, "luna");

    assert.equal(topics.length, 1);
    assert.equal(topics[0].slug, "luna-topic");
    assert.equal(topics[0].count, 6);
  } finally {
    await db.close();
  }
});
