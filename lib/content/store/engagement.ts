import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type { ContentPage, CoverageItem } from "../types.ts";

import { CONTENT_LIMITS } from "../policy.ts";

import { listContentForModel } from "./links.ts";
import { listItems } from "./items.ts";

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
