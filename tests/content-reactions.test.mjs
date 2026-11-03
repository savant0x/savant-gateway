import assert from "node:assert/strict";
import test from "node:test";

import {
  createSource,
  listReactionSummary,
  ReactionRateLimitError,
  setReaction,
  upsertItem,
} from "../lib/content/store.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

async function fixture() {
  const db = await createStorageDatabase({ env: {} });
  const source = await createSource(db, {
    kind: "rss",
    label: "Reaction feed",
    url: "https://example.com/reactions.xml",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 10,
  });
  const itemId = await upsertItem(
    db,
    source,
    {
      externalId: "reaction-1",
      kind: "article",
      title: "Reaction target",
      url: "https://example.com/reactions/target",
      excerpt: "Target.",
      bodyHtml: null,
      author: null,
      publishedAt: "2026-11-03T09:00:00.000Z",
      thumbnailUrl: null,
      videoId: null,
      tags: [],
    },
    "2026-11-03T09:30:00.000Z",
  );

  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES ('user_two', 'two@example.com', 'Second Reader', 'active', ?)`,
    )
    .run("2026-11-03T09:00:00.000Z");
  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES ('user_three', 'three@example.com', 'Third Reader', 'active', ?)`,
    )
    .run("2026-11-03T09:00:00.000Z");

  return { db, itemId };
}

test("a reaction is one current choice per customer and aggregates honestly", async () => {
  const { db, itemId } = await fixture();

  try {
    const first = await setReaction(
      db,
      "user_dev",
      itemId,
      "useful",
      true,
      "2026-11-03T10:00:00.000Z",
    );

    assert.deepEqual(first, [
      { reaction: "useful", count: 1, mine: true },
      { reaction: "insightful", count: 0, mine: false },
    ]);

    const repeated = await setReaction(
      db,
      "user_dev",
      itemId,
      "useful",
      true,
      "2026-11-03T10:01:00.000Z",
    );

    assert.equal(repeated[0].count, 1);

    const secondReader = await setReaction(
      db,
      "user_two",
      itemId,
      "useful",
      true,
      "2026-11-03T10:02:00.000Z",
    );

    assert.equal(secondReader[0].count, 2);
    assert.equal(secondReader[0].mine, true);
    assert.equal(secondReader[1].count, 0);

    const forFirstReader = await listReactionSummary(db, itemId, "user_dev");

    assert.equal(forFirstReader[0].count, 2);
    assert.equal(forFirstReader[0].mine, true);

    const removed = await setReaction(
      db,
      "user_dev",
      itemId,
      "useful",
      false,
      "2026-11-03T10:03:00.000Z",
    );

    assert.equal(removed[0].count, 1);
    assert.equal(removed[0].mine, false);

    const anonymous = await listReactionSummary(db, itemId, null);

    assert.equal(anonymous[0].count, 1);
    assert.equal(anonymous[0].mine, false);

    await db.prepare("DELETE FROM content.items WHERE id = ?").run(itemId);
    const rows = await db
      .prepare("SELECT COUNT(*) AS total FROM content.reactions")
      .get();

    assert.equal(Number(rows.total), 0);
  } finally {
    await db.close();
  }
});

test("reaction toggles are bounded by the shared hourly write ceiling", async () => {
  const { db, itemId } = await fixture();

  try {
    for (let index = 0; index < 12; index += 1) {
      await setReaction(
        db,
        "user_three",
        itemId,
        index % 2 === 0 ? "useful" : "insightful",
        index % 4 < 2,
        `2026-11-03T11:${String(index).padStart(2, "0")}:00.000Z`,
      );
    }

    await assert.rejects(
      () =>
        setReaction(
          db,
          "user_three",
          itemId,
          "useful",
          true,
          "2026-11-03T11:30:00.000Z",
        ),
      ReactionRateLimitError,
    );

    // A different customer has their own bucket.
    const other = await setReaction(
      db,
      "user_two",
      itemId,
      "insightful",
      true,
      "2026-11-03T11:30:00.000Z",
    );

    assert.equal(other[1].count, 1);
  } finally {
    await db.close();
  }
});
