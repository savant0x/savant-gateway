import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ModelAccess, ModelGroupSummary } from "../../types.ts";

import { clearPublicCatalogCache } from "./catalog.ts";

/**
 * Model group store, ported to the async handle (FID-085 step 4).
 *
 * A group is a billing tier, so its edits move money. Three rules carry over
 * unchanged: a system group keeps its billing mode, a group a plan includes
 * cannot be deleted, and moving rows into a free group zeroes their sell prices
 * in the same transaction that moves them. A group that changed mode without
 * touching prices would answer a different price than the one the catalog shows.
 *
 * One deliberate difference: the label-uniqueness check now compares
 * `lower(label)`. PostgreSQL's constraint is a unique index on `lower(label)`
 * (`model_groups_label_key`), so an exact-match check would let a case-only
 * duplicate through the application and then fail inside the index with a raw
 * driver error. The check now asks the same question the constraint answers.
 */

type GroupRow = {
  slug: string;
  label: string;
  billing_mode: ModelAccess;
  description: string | null;
  sort_order: number;
  is_system: number;
  hidden: number;
  created_at: string;
  updated_at: string;
  model_count: number;
};

type GroupMutation =
  | { ok: true; group: ModelGroupSummary }
  | { ok: false; status: 400 | 404 | 409; error: string };

const GROUP_SELECT = `
  SELECT g.*,
    (SELECT COUNT(*) FROM models m WHERE m.group_slug = g.slug) AS model_count
  FROM model_groups g
`;

function toSummary(row: GroupRow): ModelGroupSummary {
  return {
    slug: row.slug,
    label: row.label,
    billingMode: row.billing_mode,
    description: row.description,
    sortOrder: Number(row.sort_order),
    isSystem: Number(row.is_system) === 1,
    hidden: Number(row.hidden) === 1,
    modelCount: Number(row.model_count),
  };
}

async function readGroup(db: PostgresDatabase, slug: string) {
  return db.prepare(`${GROUP_SELECT} WHERE g.slug = ?`).get<GroupRow>(slug);
}

async function labelExists(
  db: PostgresDatabase,
  label: string,
  exceptSlug?: string,
) {
  const row = await db
    .prepare(
      "SELECT slug FROM model_groups WHERE lower(label) = lower(?) AND slug <> ?",
    )
    .get<{ slug: string }>(label, exceptSlug ?? "");

  return Boolean(row);
}

export async function listModelGroups(
  db: PostgresDatabase,
): Promise<ModelGroupSummary[]> {
  const rows = await db
    .prepare(`${GROUP_SELECT} ORDER BY g.sort_order ASC, g.label ASC`)
    .all<GroupRow>();

  return rows.map(toSummary);
}

export async function getModelGroup(db: PostgresDatabase, slug: string) {
  const row = await readGroup(db, slug);

  return row ? toSummary(row) : undefined;
}

export async function createModelGroup(
  db: PostgresDatabase,
  input: {
    slug: string;
    label: string;
    billingMode: ModelAccess;
    description: string | null;
    sortOrder: number;
    hidden: boolean;
    now?: string;
  },
): Promise<GroupMutation> {
  if (await readGroup(db, input.slug)) {
    return {
      ok: false,
      status: 409,
      error: "A group with that slug already exists.",
    };
  }

  if (await labelExists(db, input.label)) {
    return {
      ok: false,
      status: 409,
      error: "A group with that label already exists.",
    };
  }

  const now = input.now ?? new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO model_groups
        (slug, label, billing_mode, description, sort_order, is_system, hidden,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .run(
      input.slug,
      input.label,
      input.billingMode,
      input.description,
      input.sortOrder,
      input.hidden ? 1 : 0,
      now,
      now,
    );

  clearPublicCatalogCache(db);

  return { ok: true, group: (await getModelGroup(db, input.slug))! };
}

export async function updateModelGroup(
  db: PostgresDatabase,
  slug: string,
  input: {
    label: string;
    billingMode: ModelAccess;
    description: string | null;
    sortOrder: number;
    hidden: boolean;
    now?: string;
  },
): Promise<GroupMutation> {
  const current = await readGroup(db, slug);

  if (!current) {
    return { ok: false, status: 404, error: "Group not found." };
  }

  if (
    Number(current.is_system) === 1 &&
    current.billing_mode !== input.billingMode
  ) {
    return {
      ok: false,
      status: 400,
      error: "A system group's billing mode cannot be changed.",
    };
  }

  if (await labelExists(db, input.label, slug)) {
    return {
      ok: false,
      status: 409,
      error: "A group with that label already exists.",
    };
  }

  const now = input.now ?? new Date().toISOString();

  await db.transaction(async () => {
    await db
      .prepare(
        `UPDATE model_groups
            SET label = ?, billing_mode = ?, description = ?, sort_order = ?,
                hidden = ?, updated_at = ?
          WHERE slug = ?`,
      )
      .run(
        input.label,
        input.billingMode,
        input.description,
        input.sortOrder,
        input.hidden ? 1 : 0,
        now,
        slug,
      );

    if (input.billingMode === "free") {
      await db
        .prepare(
          `UPDATE models
              SET sell_input_micros = 0, sell_output_micros = 0
            WHERE group_slug = ?`,
        )
        .run(slug);
    }
  })();

  clearPublicCatalogCache(db);

  return { ok: true, group: (await getModelGroup(db, slug))! };
}

export type AssignGroupResult = "ok" | "model_not_found" | "group_not_found";

export async function assignModelGroup(
  db: PostgresDatabase,
  modelId: string,
  slug: string,
): Promise<AssignGroupResult> {
  const group = await readGroup(db, slug);

  if (!group) return "group_not_found";

  const model = await db
    .prepare("SELECT id FROM models WHERE id = ?")
    .get<{ id: string }>(modelId);

  if (!model) return "model_not_found";

  await db.transaction(async () => {
    await db
      .prepare(
        `UPDATE models
            SET group_slug = ?, group_source = 'manual'
          WHERE id = ?`,
      )
      .run(slug, modelId);

    if (group.billing_mode === "free") {
      await db
        .prepare(
          `UPDATE models
              SET sell_input_micros = 0, sell_output_micros = 0
            WHERE id = ?`,
        )
        .run(modelId);
    }
  })();

  clearPublicCatalogCache(db);

  return "ok";
}

export async function deleteModelGroup(
  db: PostgresDatabase,
  slug: string,
  reassignTo: string,
): Promise<
  { ok: true } | { ok: false; status: 400 | 404 | 409; error: string }
> {
  const current = await readGroup(db, slug);

  if (!current) {
    return { ok: false, status: 404, error: "Group not found." };
  }

  if (Number(current.is_system) === 1) {
    return {
      ok: false,
      status: 400,
      error: "System groups cannot be deleted.",
    };
  }

  if (reassignTo === slug) {
    return {
      ok: false,
      status: 400,
      error: "Models cannot be reassigned to the same group.",
    };
  }

  if (
    await db
      .prepare("SELECT 1 FROM plan_groups WHERE group_slug = ? LIMIT 1")
      .get(slug)
  ) {
    return {
      ok: false,
      status: 409,
      error: "This group is included by a plan. Remove it from the plan first.",
    };
  }

  const destination = await readGroup(db, reassignTo);

  if (!destination) {
    return {
      ok: false,
      status: 400,
      error: "The destination group does not exist.",
    };
  }

  await db.transaction(async () => {
    await db
      .prepare(
        `UPDATE models
            SET group_slug = ?, group_source = 'manual'
          WHERE group_slug = ?`,
      )
      .run(reassignTo, slug);

    if (destination.billing_mode === "free") {
      await db
        .prepare(
          `UPDATE models
              SET sell_input_micros = 0, sell_output_micros = 0
            WHERE group_slug = ?`,
        )
        .run(reassignTo);
    }

    await db.prepare("DELETE FROM model_groups WHERE slug = ?").run(slug);
  })();

  clearPublicCatalogCache(db);

  return { ok: true };
}
