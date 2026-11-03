import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type {
  ContentPage,
  ContentReaction,
  ContentReactionSummary,
  CoverageItem,
} from "../types.ts";

import { randomUUID } from "node:crypto";

import { CONTENT_LIMITS } from "../policy.ts";
import { CONTENT_REACTIONS } from "../types.ts";

import { listContentForModel } from "./links.ts";
import { listItems } from "./items.ts";

export class ReactionRateLimitError extends Error {}

export function isContentReaction(value: unknown): value is ContentReaction {
  return (
    typeof value === "string" &&
    (CONTENT_REACTIONS as readonly string[]).includes(value)
  );
}

export type BriefingGroup = {
  modelId: string;
  items: CoverageItem[];
};

export async function setWatch(
  db: PostgresDatabase,
  userId: string,
  modelId: string,
  watched: boolean,
  now = new Date().toISOString(),
): Promise<boolean> {
  if (!watched) {
    await db
      .prepare("DELETE FROM content.watches WHERE user_id = ? AND model_id = ?")
      .run(userId, modelId);

    return false;
  }

  const existing = await db
    .prepare(
      "SELECT 1 AS present FROM content.watches WHERE user_id = ? AND model_id = ?",
    )
    .get<{ present: number }>(userId, modelId);

  if (!existing) {
    const count = await db
      .prepare(
        "SELECT COUNT(*) AS total FROM content.watches WHERE user_id = ?",
      )
      .get<{ total: number | string }>(userId);
    const total = Number(count?.total ?? 0);

    if (total >= CONTENT_LIMITS.watchLimit) {
      throw new Error(
        `You can watch at most ${CONTENT_LIMITS.watchLimit} models.`,
      );
    }
  }

  await db
    .prepare(
      `INSERT INTO content.watches (user_id, model_id, created_at)
       VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
    )
    .run(userId, modelId, now);

  return true;
}

export async function isWatching(
  db: PostgresDatabase,
  userId: string,
  modelId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS present FROM content.watches WHERE user_id = ? AND model_id = ?",
    )
    .get<{ present: number }>(userId, modelId);

  return Boolean(row);
}

export async function listWatchedModelIds(
  db: PostgresDatabase,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT model_id FROM content.watches
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?`,
    )
    .all<{ model_id: string }>(userId, CONTENT_LIMITS.watchLimit);

  return rows.map((row) => row.model_id);
}

export async function setSaved(
  db: PostgresDatabase,
  userId: string,
  itemId: string,
  saved: boolean,
  now = new Date().toISOString(),
): Promise<boolean> {
  if (!saved) {
    await db
      .prepare(
        "DELETE FROM content.saved_items WHERE user_id = ? AND item_id = ?",
      )
      .run(userId, itemId);

    return false;
  }

  const existing = await db
    .prepare(
      "SELECT 1 AS present FROM content.saved_items WHERE user_id = ? AND item_id = ?",
    )
    .get<{ present: number }>(userId, itemId);

  if (!existing) {
    const count = await db
      .prepare(
        "SELECT COUNT(*) AS total FROM content.saved_items WHERE user_id = ?",
      )
      .get<{ total: number | string }>(userId);
    const total = Number(count?.total ?? 0);

    if (total >= CONTENT_LIMITS.savedLimit) {
      throw new Error(
        `You can save at most ${CONTENT_LIMITS.savedLimit} items.`,
      );
    }
  }

  await db
    .prepare(
      `INSERT INTO content.saved_items (user_id, item_id, created_at)
       VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
    )
    .run(userId, itemId, now);

  return true;
}

export async function isSaved(
  db: PostgresDatabase,
  userId: string,
  itemId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS present FROM content.saved_items WHERE user_id = ? AND item_id = ?",
    )
    .get<{ present: number }>(userId, itemId);

  return Boolean(row);
}

export async function listSavedItems(
  db: PostgresDatabase,
  userId: string,
): Promise<ContentPage> {
  return listItems(db, {
    savedByUserId: userId,
    limit: CONTENT_LIMITS.savedLimit,
  });
}

/**
 * Reactions are aggregate public counters with one current choice per customer.
 * The composite primary key is the idempotency rule; the event log is the
 * write ceiling, because add/remove churn would otherwise be unbounded.
 */
export async function listReactionSummary(
  db: PostgresDatabase,
  itemId: string,
  userId: string | null,
): Promise<ContentReactionSummary[]> {
  const counts = await db
    .prepare(
      `SELECT reaction, COUNT(*) AS total
         FROM content.reactions
        WHERE item_id = ?
        GROUP BY reaction`,
    )
    .all<{ reaction: ContentReaction; total: number | string }>(itemId);
  const own = userId
    ? await db
        .prepare(
          `SELECT reaction FROM content.reactions
            WHERE user_id = ? AND item_id = ?`,
        )
        .all<{ reaction: ContentReaction }>(userId, itemId)
    : [];
  const countByReaction = new Map(
    counts.map((row) => [row.reaction, Number(row.total)]),
  );
  const ownReactions = new Set(own.map((row) => row.reaction));

  return CONTENT_REACTIONS.map((reaction) => ({
    reaction,
    count: countByReaction.get(reaction) ?? 0,
    mine: ownReactions.has(reaction),
  }));
}

export async function setReaction(
  db: PostgresDatabase,
  userId: string,
  itemId: string,
  reaction: ContentReaction,
  active: boolean,
  now = new Date().toISOString(),
): Promise<ContentReactionSummary[]> {
  const cutoff = new Date(
    new Date(now).getTime() - 60 * 60 * 1000,
  ).toISOString();
  const recent = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM content.reaction_events
        WHERE user_id = ? AND created_at >= ?`,
    )
    .get<{ total: number | string }>(userId, cutoff);

  if (Number(recent?.total ?? 0) >= CONTENT_LIMITS.commentsPerHour) {
    throw new ReactionRateLimitError(
      `You can change reactions at most ${CONTENT_LIMITS.commentsPerHour} times an hour.`,
    );
  }

  await db
    .prepare(
      `INSERT INTO content.reaction_events (id, user_id, created_at)
       VALUES (?, ?, ?)`,
    )
    .run(`rev_${randomUUID()}`, userId, now);

  // Keep the log bounded; a user's older events have no admission value.
  const pruneBefore = new Date(
    new Date(now).getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();

  await db
    .prepare(
      "DELETE FROM content.reaction_events WHERE user_id = ? AND created_at < ?",
    )
    .run(userId, pruneBefore);

  if (active) {
    await db
      .prepare(
        `INSERT INTO content.reactions (user_id, item_id, reaction, created_at)
         VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      )
      .run(userId, itemId, reaction, now);
  } else {
    await db
      .prepare(
        `DELETE FROM content.reactions
          WHERE user_id = ? AND item_id = ? AND reaction = ?`,
      )
      .run(userId, itemId, reaction);
  }

  return listReactionSummary(db, itemId, userId);
}

/**
 * The briefing is a chronological read of watched-model coverage, not a
 * recommendation score. A group with no item in the window is omitted.
 */
export async function briefingForUser(
  db: PostgresDatabase,
  userId: string,
  now = new Date(),
  days = CONTENT_LIMITS.briefingDays,
): Promise<BriefingGroup[]> {
  const modelIds = await listWatchedModelIds(db, userId);
  const cutoff = new Date(
    now.getTime() - days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const groups: BriefingGroup[] = [];

  for (const modelId of modelIds.slice(0, 6)) {
    const coverage = await listContentForModel(db, modelId, 12);
    const items = coverage.items
      .filter((item) => item.publishedAt >= cutoff)
      .slice(0, 4);

    if (items.length > 0) groups.push({ modelId, items });
  }

  return groups;
}
