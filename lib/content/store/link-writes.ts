import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type {
  ContentLinkState,
  ContentRelation,
  LinkSuggestion,
} from "../types.ts";

import { randomUUID } from "node:crypto";

/**
 * The only write path for content/model link decisions (FID-2026-1104-016).
 *
 * Automatic reconciliation may create and refresh suggested or auto-published
 * rows, and may retire its own undecided rows that no longer match. It must
 * never update an accepted or dismissed row. Those states change only through
 * an explicit operator decision (or the manual-link form).
 */

export type LinkDecisionAction = "accept" | "dismiss" | "restore";

export type LinkDecisionResult =
  | {
      ok: true;
      state: ContentLinkState;
      revision: number;
    }
  | {
      ok: false;
      conflict?: true;
      missing?: true;
    };

const AUTO_STATES = "('suggested', 'auto_published', 'retired')";

async function recordDecision(
  db: PostgresDatabase,
  input: {
    itemId: string;
    modelId: string;
    action:
      | "suggested"
      | "auto_published"
      | "accepted"
      | "dismissed"
      | "restored"
      | "retired";
    actor: "operator" | "system" | "migration";
    reason: string;
    at: string;
    revision: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO content.link_decisions
        (id, item_id, model_id, action, actor, reason, created_at,
         link_revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `lkd_${randomUUID()}`,
      input.itemId,
      input.modelId,
      input.action,
      input.actor,
      input.reason,
      input.at,
      input.revision,
    );
}

/**
 * Reconcile one item's automatic suggestions. A missing suggestion retires an
 * undecided automatic row instead of deleting it, so the history survives. An
 * accepted or dismissed pair is ignored by the conflict update and the retire
 * statement.
 */
export async function replaceAutoLinks(
  db: PostgresDatabase,
  itemId: string,
  suggestions: LinkSuggestion[],
  now = new Date().toISOString(),
): Promise<{ matched: number; retired: number }> {
  let retiredCount = 0;

  await db.transaction(async () => {
    for (const suggestion of suggestions) {
      const state: ContentLinkState = suggestion.reviewed
        ? "auto_published"
        : "suggested";

      await db
        .prepare(
          `INSERT INTO content.model_links
            (item_id, model_id, relation, relation_source, confidence, reason,
             reviewed, state, decision_at, decision_source, revision,
             created_at, updated_at)
           VALUES (?, ?, ?, 'auto', ?, ?, ?, ?, ?, 'system', 0, ?, ?)
           ON CONFLICT (item_id, model_id) DO UPDATE SET
             relation = EXCLUDED.relation,
             confidence = EXCLUDED.confidence,
             reason = EXCLUDED.reason,
             reviewed = CASE
               WHEN content.model_links.state = 'auto_published' THEN 1
               ELSE EXCLUDED.reviewed
             END,
             state = CASE
               WHEN content.model_links.state = 'auto_published' THEN
                 'auto_published'
               ELSE EXCLUDED.state
             END,
             decision_at = CASE
               WHEN content.model_links.state = 'retired'
                 THEN EXCLUDED.decision_at
               ELSE content.model_links.decision_at
             END,
             updated_at = EXCLUDED.updated_at
           WHERE content.model_links.relation_source = 'auto'
             AND content.model_links.state IN ${AUTO_STATES}`,
        )
        .run(
          itemId,
          suggestion.modelId,
          suggestion.relation,
          suggestion.confidence,
          suggestion.reason,
          state === "suggested" ? 0 : 1,
          state,
          state === "suggested" ? null : now,
          now,
          now,
        );
    }

    const exclusion = suggestions.length
      ? `AND model_id NOT IN (${suggestions.map(() => "?").join(", ")})`
      : "";
    const retired = await db
      .prepare(
        `UPDATE content.model_links
            SET state = 'retired',
                reviewed = 1,
                decision_at = ?,
                decision_source = 'system',
                revision = revision + 1,
                updated_at = ?
          WHERE item_id = ?
            AND relation_source = 'auto'
            AND state IN ('suggested', 'auto_published')
            ${exclusion}
          RETURNING model_id, revision`,
      )
      .all<{ model_id: string; revision: number }>(
        now,
        now,
        itemId,
        ...suggestions.map((suggestion) => suggestion.modelId),
      );

    retiredCount = retired.length;

    for (const row of retired) {
      await recordDecision(db, {
        itemId,
        modelId: row.model_id,
        action: "retired",
        actor: "system",
        reason: "No current alias match",
        at: now,
        revision: row.revision,
      });
    }
  })();

  return { matched: suggestions.length, retired: retiredCount };
}

/**
 * A manual link is an explicit acceptance. It can replace an automatic or
 * dismissed row for the same exact pair, but it never touches content.
 */
export async function manualLink(
  db: PostgresDatabase,
  itemId: string,
  modelId: string,
  relation: ContentRelation,
  reason = "Operator link",
  now = new Date().toISOString(),
): Promise<void> {
  await db.transaction(async () => {
    const row = await db
      .prepare(
        `INSERT INTO content.model_links
          (item_id, model_id, relation, relation_source, confidence, reason,
           reviewed, state, decision_at, decision_source, revision,
           created_at, updated_at)
         VALUES (?, ?, ?, 'operator', 1, ?, 1, 'accepted', ?, 'operator', 0,
                 ?, ?)
         ON CONFLICT (item_id, model_id) DO UPDATE SET
           relation = EXCLUDED.relation,
           relation_source = 'operator',
           confidence = 1,
           reason = EXCLUDED.reason,
           reviewed = 1,
           state = 'accepted',
           decision_at = EXCLUDED.decision_at,
           decision_source = 'operator',
           revision = content.model_links.revision + 1,
           updated_at = EXCLUDED.updated_at
         RETURNING revision`,
      )
      .get<{ revision: number }>(
        itemId,
        modelId,
        relation,
        reason,
        now,
        now,
        now,
      );

    if (row) {
      await recordDecision(db, {
        itemId,
        modelId,
        action: "accepted",
        actor: "operator",
        reason,
        at: now,
        revision: row.revision,
      });
    }
  })();
}

function nextState(action: LinkDecisionAction): ContentLinkState {
  if (action === "accept") return "accepted";
  if (action === "dismiss") return "dismissed";

  return "suggested";
}

function actionEvent(action: LinkDecisionAction) {
  return action === "accept"
    ? "accepted"
    : action === "dismiss"
      ? "dismissed"
      : "restored";
}

/**
 * Apply one explicit decision with an optional compare-and-swap revision. The
 * row lock makes two concurrent operators produce one winner and one conflict,
 * never two different final states.
 */
export async function decideLink(
  db: PostgresDatabase,
  input: {
    itemId: string;
    modelId: string;
    action: LinkDecisionAction;
    expectedRevision?: number;
    reason?: string;
    actor?: "operator" | "system";
    now?: string;
  },
): Promise<LinkDecisionResult> {
  const now = input.now ?? new Date().toISOString();
  const actor = input.actor ?? "operator";
  const result = await db.transaction(async () => {
    const row = await db
      .prepare(
        `SELECT state, revision FROM content.model_links
          WHERE item_id = ? AND model_id = ?
          FOR UPDATE`,
      )
      .get<{ state: ContentLinkState; revision: number }>(
        input.itemId,
        input.modelId,
      );

    if (!row) return { ok: false as const, missing: true as const };

    if (
      input.expectedRevision !== undefined &&
      row.revision !== input.expectedRevision
    ) {
      return { ok: false as const, conflict: true as const };
    }

    const state = nextState(input.action);

    if (row.state === state) {
      return { ok: true as const, state, revision: row.revision };
    }

    const revision = row.revision + 1;
    const updated = await db
      .prepare(
        `UPDATE content.model_links
            SET state = ?,
                reviewed = ?,
                decision_at = ?,
                decision_source = ?,
                revision = ?,
                updated_at = ?
          WHERE item_id = ? AND model_id = ? AND revision = ?`,
      )
      .run(
        state,
        state === "suggested" ? 0 : 1,
        now,
        actor,
        revision,
        now,
        input.itemId,
        input.modelId,
        row.revision,
      );

    if (updated.changes !== 1) {
      return { ok: false as const, conflict: true as const };
    }

    await recordDecision(db, {
      itemId: input.itemId,
      modelId: input.modelId,
      action: actionEvent(input.action),
      actor,
      reason:
        input.reason ??
        (input.action === "accept"
          ? "Operator accepted the model link"
          : input.action === "dismiss"
            ? "Operator dismissed the model link"
            : "Operator restored the model link"),
      at: now,
      revision,
    });

    return { ok: true as const, state, revision };
  })();

  return result;
}

export async function dismissAutoLink(
  db: PostgresDatabase,
  itemId: string,
  modelId: string,
  now = new Date().toISOString(),
): Promise<boolean> {
  const result = await decideLink(db, {
    itemId,
    modelId,
    action: "dismiss",
    now,
  });

  return result.ok;
}

export async function acceptAutoLink(
  db: PostgresDatabase,
  itemId: string,
  modelId: string,
  now = new Date().toISOString(),
): Promise<boolean> {
  const result = await decideLink(db, {
    itemId,
    modelId,
    action: "accept",
    now,
  });

  return result.ok;
}

export async function restoreAutoLink(
  db: PostgresDatabase,
  itemId: string,
  modelId: string,
  now = new Date().toISOString(),
): Promise<boolean> {
  const result = await decideLink(db, {
    itemId,
    modelId,
    action: "restore",
    now,
  });

  return result.ok;
}
