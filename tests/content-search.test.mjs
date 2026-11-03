import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTENT_SEARCH_LIMITS,
  parseSearchQuery,
} from "../lib/content/search.ts";
import {
  createSource,
  listItems,
  listTags,
  searchModels,
  upsertItem,
} from "../lib/content/store.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

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
