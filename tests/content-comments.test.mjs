import assert from "node:assert/strict";
import test from "node:test";

import {
  addComment,
  CommentParentError,
  contentStats,
  createSource,
  deleteComment,
  listComments,
  listRecentCommentsForOperator,
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

test("only the author or an operator can delete a comment, and replies cascade", async () => {
  const { db, itemId } = await fixture();

  try {
    await db
      .prepare(
        `INSERT INTO users (id, email, name, status, created_at)
         VALUES ('user_other', 'other@example.com', 'Other Customer', 'active', ?)
         ON CONFLICT DO NOTHING`,
      )
      .run("2026-11-03T09:00:00.000Z");

    const parent = await addComment(
      db,
      "user_dev",
      itemId,
      "Delete me.",
      { now: "2026-11-03T10:00:00.000Z" },
    );

    await addComment(db, "user_dev", itemId, "A reply.", {
      parentId: parent.id,
      now: "2026-11-03T10:01:00.000Z",
    });

    const viewerRows = await listComments(db, itemId, 50, "user_dev");
    const otherRows = await listComments(db, itemId, 50, "user_other");

    assert.equal(viewerRows.every((comment) => comment.canDelete), true);
    assert.equal(otherRows.every((comment) => comment.canDelete), false);

    const foreign = await deleteComment(db, parent.id, {
      userId: "user_other",
      itemId,
    });

    assert.equal(foreign, false);
    assert.equal((await listComments(db, itemId)).length, 2);

    const own = await deleteComment(db, parent.id, {
      userId: "user_dev",
      itemId,
    });

    assert.equal(own, true);
    assert.equal((await listComments(db, itemId)).length, 0);

    const adminComment = await addComment(
      db,
      "user_dev",
      itemId,
      "Operator removal.",
      { now: "2026-11-03T10:02:00.000Z" },
    );
    const recent = await listRecentCommentsForOperator(db, 5);

    assert.equal(recent[0].id, adminComment.id);
    assert.equal(recent[0].itemTitle, "Item one");
    assert.ok(recent[0].authorEmail);

    const stats = await contentStats(db);

    assert.equal(stats.comments, 1);

    assert.equal(
      await deleteComment(db, adminComment.id, { operator: true }),
      true,
    );
    assert.equal((await listComments(db, itemId)).length, 0);
  } finally {
    await db.close();
  }
});
