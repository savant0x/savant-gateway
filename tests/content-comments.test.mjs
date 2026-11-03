import assert from "node:assert/strict";
import test from "node:test";

import {
  addComment,
  CommentParentError,
  createSource,
  listComments,
  upsertItem,
} from "../lib/content/store.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

async function fixture() {
  const db = await createStorageDatabase({ env: {} });
  const source = await createSource(db, {
    kind: "rss",
    label: "Discussion feed",
    url: "https://example.com/discussion.xml",
    config: { tags: [] },
    enabled: true,
    fetchIntervalMinutes: 60,
    maxItems: 10,
  });

  async function item(slug) {
    return upsertItem(
      db,
      source,
      {
        externalId: slug,
        kind: "article",
        title: `Item ${slug}`,
        url: `https://example.com/discussion/${slug}`,
        excerpt: "Discussion target.",
        bodyHtml: null,
        author: null,
        publishedAt: "2026-11-03T09:00:00.000Z",
        thumbnailUrl: null,
        videoId: null,
        tags: [],
      },
      "2026-11-03T09:30:00.000Z",
    );
  }

  return { db, itemId: await item("one"), otherItemId: await item("two") };
}

test("comments support one reply level and reject deeper or foreign parents", async () => {
  const { db, itemId, otherItemId } = await fixture();

  try {
    const parent = await addComment(
      db,
      "user_dev",
      itemId,
      "Top-level take.",
      { now: "2026-11-03T10:00:00.000Z" },
    );
    const reply = await addComment(
      db,
      "user_dev",
      itemId,
      "A reply.",
      { parentId: parent.id, now: "2026-11-03T10:01:00.000Z" },
    );

    assert.equal(parent.parentId, null);
    assert.equal(reply.parentId, parent.id);

    await assert.rejects(
      () =>
        addComment(db, "user_dev", itemId, "Too deep.", {
          parentId: reply.id,
          now: "2026-11-03T10:02:00.000Z",
        }),
      CommentParentError,
    );

    await assert.rejects(
      () =>
        addComment(db, "user_dev", otherItemId, "Wrong item.", {
          parentId: parent.id,
          now: "2026-11-03T10:02:00.000Z",
        }),
      CommentParentError,
    );

    await assert.rejects(
      () =>
        addComment(db, "user_dev", itemId, "Missing parent.", {
          parentId: "cmt_missing",
          now: "2026-11-03T10:02:00.000Z",
        }),
      CommentParentError,
    );

    const listed = await listComments(db, itemId);

    assert.equal(listed.length, 2);
    assert.deepEqual(
      listed.map((entry) => entry.parentId).sort(),
      [null, parent.id].sort(),
    );

    await db
      .prepare("DELETE FROM content.comments WHERE id = ?")
      .run(parent.id);

    const remaining = await db
      .prepare("SELECT COUNT(*) AS total FROM content.comments WHERE item_id = ?")
      .get(itemId);

    assert.equal(Number(remaining.total), 0);
  } finally {
    await db.close();
  }
});
