import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type { ContentKind, LinkableModel } from "../types.ts";

import { descriptionEvidence } from "../description-evidence.ts";
import { suggestModelLinks } from "../linking.ts";
import {
  defaultMatchingPolicy,
  MATCHING_SETTINGS_KEY,
} from "../matching-policy.ts";

import { replaceAutoLinks } from "./link-writes.ts";
import { readMatchingPolicy } from "./matching.ts";

type StoredItem = {
  title: string;
  kind: ContentKind;
  source_kind: string;
  body_html: string | null;
  excerpt: string;
};

/** Match a locked current item under the current locked policy. */
export async function matchStoredItem(
  db: PostgresDatabase,
  itemId: string,
  models: LinkableModel[],
  options: { at: string; runId?: string; owner?: string },
): Promise<{ matched: number; retired: number }> {
  return db.transaction(async () => {
    if (options.runId && options.owner) {
      const run = await db
        .prepare(
          `SELECT id FROM content.rematch_runs
          WHERE id = ? AND owner_token = ? AND status = 'running'
            AND cancel_requested = 0 AND expires_at::timestamptz > ?::timestamptz
          FOR UPDATE`,
        )
        .get<{ id: string }>(options.runId, options.owner, options.at);

      if (!run) throw new Error("Rematch ownership expired or was cancelled.");
    }

    await db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO NOTHING`,
      )
      .run(
        MATCHING_SETTINGS_KEY,
        JSON.stringify(defaultMatchingPolicy()),
        options.at,
      );
    await db
      .prepare("SELECT key FROM settings WHERE key = ? FOR SHARE")
      .get(MATCHING_SETTINGS_KEY);
    const matching = await readMatchingPolicy(db);

    if (matching.error) throw new Error("The matching policy is invalid.");
    if (!matching.policy.enabled) {
      if (options.runId) {
        throw new Error("Matching is disabled; the item was not processed.");
      }

      return { matched: 0, retired: 0 };
    }

    const item = await db
      .prepare(
        `SELECT i.title, i.kind, s.kind AS source_kind, i.body_html, i.excerpt
         FROM content.items i JOIN content.sources s ON s.id = i.source_id
        WHERE i.id = ? FOR UPDATE OF i`,
      )
      .get<StoredItem>(itemId);

    if (!item) return { matched: 0, retired: 0 };

    const tags = await db
      .prepare(
        "SELECT tag FROM content.item_tags WHERE item_id = ? ORDER BY tag",
      )
      .all<{ tag: string }>(itemId);
    const suggestions = suggestModelLinks(
      {
        title: item.title,
        kind: item.kind,
        tags: tags.map((entry) => entry.tag),
        sourceKind: item.source_kind,
        description:
          item.source_kind === "youtube"
            ? descriptionEvidence(item.body_html, item.excerpt)
            : undefined,
      },
      models,
      matching.policy,
    );

    return replaceAutoLinks(db, itemId, suggestions, options.at);
  })();
}
