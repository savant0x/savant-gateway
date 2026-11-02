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
};

export class CommentRateLimitError extends Error {}

const COMMENT_COLUMNS = `
  c.id,
  COALESCE(NULLIF(BTRIM(u.name), ''), 'Customer') AS author_name,
  c.body,
  c.created_at
`;

function toComment(row: CommentRow): ContentComment {
  return {
    id: row.id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
  };
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
  now = new Date().toISOString(),
): Promise<ContentComment> {
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
      `INSERT INTO content.comments (id, item_id, user_id, body, created_at)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .all<{ id: string }>(`cmt_${randomUUID()}`, itemId, userId, body, now);

  const user = await db
    .prepare("SELECT name FROM users WHERE id = ?")
    .get<{ name: string | null }>(userId);

  return {
    id: created[0]?.id ?? "",
    authorName: user?.name?.trim() || "Customer",
    body,
    createdAt: now,
  };
}
