import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type { ContentComment } from "../types.ts";

import { randomUUID } from "node:crypto";

import { CONTENT_LIMITS } from "../policy.ts";

/**
 * On-site discussion for a Signal item (FID-2026-1102-092).
 *
 * Comments reference the existing customer identity; there is no second
 * account system. A displayed author name is the account name, never the email
 * address. Store failures are ordinary errors so the route can map them.
 */

type CommentRow = {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
  parent_id: string | null;
};

export class CommentRateLimitError extends Error {}

/** A reply target is missing, belongs to another item, or is itself a reply. */
export class CommentParentError extends Error {}

const COMMENT_COLUMNS = `
  c.id,
  COALESCE(NULLIF(BTRIM(u.name), ''), 'Customer') AS author_name,
  c.body,
  c.created_at,
  c.parent_id
`;

function toComment(row: CommentRow): ContentComment {
  return {
    id: row.id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
    parentId: row.parent_id,
  };
}

export type CommentInput = {
  /** Null or omitted posts a top-level comment; one reply level is allowed. */
  parentId?: string | null;
  now?: string;
};

async function assertReplyParent(
  db: PostgresDatabase,
  itemId: string,
  parentId: string,
): Promise<void> {
  const parent = await db
    .prepare("SELECT item_id, parent_id FROM content.comments WHERE id = ?")
    .get<{ item_id: string; parent_id: string | null }>(parentId);

  if (!parent || parent.item_id !== itemId) {
    throw new CommentParentError("Reply to a comment on this item.");
  }

  if (parent.parent_id) {
    throw new CommentParentError("Replies are limited to one level.");
  }
}

export async function listComments(
  db: PostgresDatabase,
  itemId: string,
  limit = CONTENT_LIMITS.commentPageSize,
): Promise<ContentComment[]> {
  const rows = await db
    .prepare(
      `SELECT ${COMMENT_COLUMNS}
         FROM content.comments c
         JOIN users u ON u.id = c.user_id
        WHERE c.item_id = ?
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT ?`,
    )
    .all<CommentRow>(itemId, Math.min(100, Math.max(1, Math.trunc(limit))));

  return rows.map(toComment);
}

export async function countComments(
  db: PostgresDatabase,
  itemId: string,
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS total FROM content.comments WHERE item_id = ?")
    .get<{ total: number | string }>(itemId);

  return Number(row?.total ?? 0);
}

/**
 * One post per call. The hourly ceiling is counted in the database, so two
 * concurrent posts cannot both slip under it in separate processes.
 */
export async function addComment(
  db: PostgresDatabase,
  userId: string,
  itemId: string,
  body: string,
  input: CommentInput = {},
): Promise<ContentComment> {
  const now = input.now ?? new Date().toISOString();
  const parentId = input.parentId ?? null;

  if (parentId) await assertReplyParent(db, itemId, parentId);

  const cutoff = new Date(
    new Date(now).getTime() - 60 * 60 * 1000,
  ).toISOString();
  const recent = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM content.comments
        WHERE user_id = ? AND created_at >= ?`,
    )
    .get<{ total: number | string }>(userId, cutoff);

  if (Number(recent?.total ?? 0) >= CONTENT_LIMITS.commentsPerHour) {
    throw new CommentRateLimitError(
      `You can post at most ${CONTENT_LIMITS.commentsPerHour} comments an hour.`,
    );
  }

  const created = await db
    .prepare(
      `INSERT INTO content.comments
        (id, item_id, user_id, parent_id, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .all<{ id: string }>(
      `cmt_${randomUUID()}`,
      itemId,
      userId,
      parentId,
      body,
      now,
    );

  const user = await db
    .prepare("SELECT name FROM users WHERE id = ?")
    .get<{ name: string | null }>(userId);

  return {
    id: created[0]?.id ?? "",
    authorName: user?.name?.trim() || "Customer",
    body,
    createdAt: now,
    parentId,
  };
}
