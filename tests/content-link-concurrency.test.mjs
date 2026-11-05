import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createSource } from "../lib/content/store/sources.ts";
import { upsertItem } from "../lib/content/store/item-writes.ts";
import {
  decideLink,
  replaceAutoLinks,
} from "../lib/content/store/link-writes.ts";
import { createPostgresDatabase } from "../lib/storage/pg-adapter.ts";
import { createPostgresPool } from "../lib/storage/pg-pool.ts";
import { migrateDatabase } from "../lib/storage/schema/index.ts";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const MODEL_ID = "free/gpt-6-luna";

/**
 * PGlite has one connection, so it cannot show two operators deciding the same
 * link at once. The dedicated gate supplies TEST_DATABASE_URL and turns a skip
 * into a failure.
 */
test("two connections cannot commit conflicting link decisions", async (context) => {
  if (!TEST_DATABASE_URL) {
    if (process.env.CONTENT_CONCURRENCY_REQUIRED === "1") {
      assert.fail(
        "CONTENT_CONCURRENCY_REQUIRED is set but TEST_DATABASE_URL is missing",
      );
    }

    context.skip("TEST_DATABASE_URL is required for the link decision race");

    return;
  }

  const first = createPostgresDatabase({
    pool: createPostgresPool({ connectionString: TEST_DATABASE_URL }),
  });
  const second = createPostgresDatabase({
    pool: createPostgresPool({ connectionString: TEST_DATABASE_URL }),
  });
  let sourceId = null;

  try {
    await migrateDatabase(first);

    await first
      .prepare(
        `INSERT INTO models
          (id, upstream_id, name, provider, family, context_window, token_weight,
           input_price_micros, output_price_micros, allow_free, supports_tools,
           supports_vision, status, sort_order, synced_at, in_catalog)
         VALUES (?, 'gpt-6-luna', 'GPT-6 Luna', 'GPT', 'GPT', '128000', 1, 0,
                 0, 1, 0, 0, 'active', 0, ?, 1)
         ON CONFLICT DO NOTHING`,
      )
      .run(MODEL_ID, new Date().toISOString());

    const source = await createSource(first, {
      kind: "rss",
      label: "Link race fixture",
      url: `https://example.com/link-race-${randomUUID()}.xml`,
      config: { tags: [] },
      enabled: true,
      fetchIntervalMinutes: 60,
      maxItems: 5,
    });
    sourceId = source.id;
    const itemId = await upsertItem(
      first,
      source,
      {
        externalId: `link-race-${randomUUID()}`,
        kind: "article",
        title: "GPT-6 Luna release",
        url: `https://example.com/link-race-${randomUUID()}`,
        excerpt: "A release.",
        bodyHtml: "<p>A release.</p>",
        author: null,
        publishedAt: "2026-11-02T10:00:00.000Z",
        thumbnailUrl: null,
        videoId: null,
        tags: [],
      },
      "2026-11-02T11:00:00.000Z",
    );

    await replaceAutoLinks(first, itemId, [
      {
        modelId: MODEL_ID,
        relation: "release",
        confidence: 1,
        reason: "Title matches the model alias",
        reviewed: false,
      },
    ]);

    const outcomes = await Promise.all([
      decideLink(first, {
        itemId,
        modelId: MODEL_ID,
        action: "accept",
        expectedRevision: 0,
      }),
      decideLink(second, {
        itemId,
        modelId: MODEL_ID,
        action: "dismiss",
        expectedRevision: 0,
      }),
    ]);

    assert.equal(
      outcomes.filter((outcome) => outcome.ok).length,
      1,
      "exactly one decision may commit",
    );
    assert.equal(
      outcomes.filter((outcome) => !outcome.ok && outcome.conflict).length,
      1,
      "the losing decision must be a revision conflict",
    );

    const final = await first
      .prepare(
        `SELECT state, revision FROM content.model_links
          WHERE item_id = ? AND model_id = ?`,
      )
      .get(itemId, MODEL_ID);

    assert.ok(["accepted", "dismissed"].includes(final.state));
    assert.equal(final.revision, 1);

    const decisions = await first
      .prepare(
        `SELECT COUNT(*) AS total FROM content.link_decisions
          WHERE item_id = ? AND model_id = ?`,
      )
      .get(itemId, MODEL_ID);

    assert.equal(Number(decisions.total), 1);
  } finally {
    if (sourceId) {
      await first
        .prepare("DELETE FROM content.sources WHERE id = ?")
        .run(sourceId)
        .catch(() => undefined);
    }

    await first.close();
    await second.close();
  }
});
