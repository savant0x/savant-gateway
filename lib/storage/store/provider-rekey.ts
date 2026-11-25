import type { PostgresDatabase } from "../pg-adapter.ts";

import { publicModelId } from "../../providers/registry.ts";

/**
 * Switch-time public-id migration (FID-2026-1124-004).
 *
 * A published id is a function of which provider is the default, but `models`
 * is keyed by id while `models_upstream_idx` is unique on
 * `(upstream_slug, upstream_id)`. Moving the flag without moving the rows leaves
 * those two facts disagreeing, and the next sync of either provider then fails
 * with `23505` and rolls back. So the switch is the one moment the ids have to be
 * rewritten, and it has to happen in the same transaction as the flag.
 *
 * Two properties make the rewrite safe:
 *
 * 1. **A temporary namespace.** The two providers' ids are exactly swapped
 *    (`gpt-5` becomes `savant/gpt-5` and `inferhub/gpt-5` becomes `gpt-5`), and
 *    PostgreSQL checks a unique index per row, so a direct swap collides. Every
 *    row first moves to `id || U+0001` — a suffix no upstream id can contain —
 *    and only then to its final id.
 * 2. **The foreign key moves in the same statement.** `plan_models.model_id`
 *    references `models(id)` with no `ON UPDATE` action, so moving the parent row
 *    alone is refused. A data-modifying CTE updates both tables in one statement:
 *    referential checks run after the statement, when both sides already agree.
 *
 * Entitlements move with the ids; history does not. `usage_events`,
 * `pricing_decisions` and `content.link_decisions` keep the string they were
 * recorded under, because they describe what a customer was sold or what an
 * operator decided at that time. The live association tables (plans,
 * subscriptions, saved-model watches, content links, showcase bindings and
 * aliases) follow the model.
 */

const TEMP_SUFFIX = "\u0001";

/** Bounds the parameter count of one statement on a large catalog. */
const CHUNK = 250;

export type RekeyEntry = { oldId: string; newId: string };

type ModelIdentity = {
  id: string;
  upstream_slug: string;
  upstream_id: string;
};

function valuesClause(count: number) {
  return Array.from({ length: count }, () => "(?::text, ?::text)").join(", ");
}

function chunks<T>(rows: T[], size = CHUNK) {
  const grouped: T[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    grouped.push(rows.slice(index, index + size));
  }

  return grouped;
}

async function applyMap(
  db: PostgresDatabase,
  statement: string,
  entries: RekeyEntry[],
) {
  for (const group of chunks(entries)) {
    await db
      .prepare(
        `WITH map(old_id, new_id) AS (VALUES ${valuesClause(group.length)})
         ${statement}`,
      )
      .run(...group.flatMap((entry) => [entry.oldId, entry.newId]));
  }
}

/**
 * `models` and `plan_models` must move together: the foreign key is immediate,
 * so a statement that changes only one side is rejected.
 */
const MODELS_WITH_PLAN_MODELS = `
  , moved AS (
    UPDATE models AS m SET id = map.new_id
    FROM map WHERE m.id = map.old_id
    RETURNING 1
  )
  UPDATE plan_models AS p SET model_id = map.new_id
  FROM map WHERE p.model_id = map.old_id
`;

/** Association tables with no foreign key to `models`. */
const DEPENDENT_STATEMENTS = [
  `UPDATE subscription_models AS t SET model_id = map.new_id
    FROM map WHERE t.model_id = map.old_id`,
  `UPDATE content.model_links AS t SET model_id = map.new_id
    FROM map WHERE t.model_id = map.old_id`,
  `UPDATE content.watches AS t SET model_id = map.new_id
    FROM map WHERE t.model_id = map.old_id`,
  `UPDATE showcase.bindings AS t SET model_id = map.new_id
    FROM map WHERE t.model_id = map.old_id`,
  `UPDATE showcase.model_aliases AS t SET model_id = map.new_id
    FROM map WHERE t.model_id = map.old_id`,
];

export type ModelRekey = RekeyEntry & { upstreamSlug: string };

/**
 * The intended id for every row of the affected providers.
 *
 * A target id held by a third provider is a refusal, not a collision to resolve:
 * the public-id rule makes it unreachable today, and a switch should fail before
 * writing rather than half-apply.
 */
export async function planProviderRekey(
  db: PostgresDatabase,
  nextSlug: string,
  slugs: string[],
): Promise<ModelRekey[]> {
  const placeholders = slugs.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT id, upstream_slug, upstream_id FROM models
        WHERE upstream_slug IN (${placeholders})`,
    )
    .all<ModelIdentity>(...slugs);
  const plan = rows.map((row) => ({
    oldId: row.id,
    newId: publicModelId(nextSlug, row.upstream_slug, row.upstream_id),
    upstreamSlug: row.upstream_slug,
  }));

  for (const group of chunks(plan.map((entry) => entry.newId))) {
    const marks = group.map(() => "?").join(", ");
    const held = await db
      .prepare(`SELECT id, upstream_slug FROM models WHERE id IN (${marks})`)
      .all<{ id: string; upstream_slug: string }>(...group);

    const foreign = held.find((row) => !slugs.includes(row.upstream_slug));

    if (foreign) {
      throw new Error(
        `Switching the default would publish ${foreign.id}, which ${foreign.upstream_slug} already owns.`,
      );
    }
  }

  return plan;
}

/**
 * Rewrites the affected rows to the ids the new default implies.
 *
 * Runs inside the caller's transaction. Returns the plan so the caller can report
 * what moved.
 */
export async function rekeyProviderIds(
  db: PostgresDatabase,
  nextSlug: string,
  slugs: string[],
) {
  const plan = await planProviderRekey(db, nextSlug, slugs);

  if (plan.length === 0) return plan;

  await applyMap(
    db,
    MODELS_WITH_PLAN_MODELS,
    plan.map((entry) => ({
      oldId: entry.oldId,
      newId: entry.oldId + TEMP_SUFFIX,
    })),
  );

  await applyMap(
    db,
    MODELS_WITH_PLAN_MODELS,
    plan.map((entry) => ({
      oldId: entry.oldId + TEMP_SUFFIX,
      newId: entry.newId,
    })),
  );

  for (const statement of DEPENDENT_STATEMENTS) {
    await applyMap(db, statement, plan);
  }

  return plan;
}

/** The id each affected row will carry once `slug` is the default. */
export async function previewProviderRekey(
  db: PostgresDatabase,
  nextSlug: string,
  slugs: string[],
) {
  return planProviderRekey(db, nextSlug, slugs);
}
