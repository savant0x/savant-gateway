import "server-only";

import type { ModelAccess, ModelGroupSummary } from "../types";

import { db, nowIso } from "../db";

type GroupRow = {
  slug: string;
  label: string;
  billing_mode: ModelAccess;
  description: string | null;
  sort_order: number;
  is_system: number;
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
    sortOrder: row.sort_order,
    isSystem: row.is_system === 1,
    modelCount: row.model_count,
  };
}

function readGroup(slug: string) {
  return db.prepare(`${GROUP_SELECT} WHERE g.slug = ?`).get(slug) as
    GroupRow | undefined;
}

function labelExists(label: string, exceptSlug?: string) {
  const row = db
    .prepare("SELECT slug FROM model_groups WHERE label = ? AND slug <> ?")
    .get(label, exceptSlug ?? "") as { slug: string } | undefined;

  return Boolean(row);
}

export function listModelGroups(): ModelGroupSummary[] {
  const rows = db
    .prepare(`${GROUP_SELECT} ORDER BY g.sort_order ASC, g.label ASC`)
    .all() as GroupRow[];

  return rows.map(toSummary);
}

export function getModelGroup(slug: string) {
  const row = readGroup(slug);

  return row ? toSummary(row) : undefined;
}

export function createModelGroup(input: {
  slug: string;
  label: string;
  billingMode: ModelAccess;
  description: string | null;
  sortOrder: number;
}): GroupMutation {
  if (readGroup(input.slug)) {
    return {
      ok: false,
      status: 409,
      error: "A group with that slug already exists.",
    };
  }

  if (labelExists(input.label)) {
    return {
      ok: false,
      status: 409,
      error: "A group with that label already exists.",
    };
  }

  const now = nowIso();

  db.prepare(
    `INSERT INTO model_groups
      (slug, label, billing_mode, description, sort_order, is_system,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    input.slug,
    input.label,
    input.billingMode,
    input.description,
    input.sortOrder,
    now,
    now,
  );

  return { ok: true, group: getModelGroup(input.slug)! };
}

export function updateModelGroup(
  slug: string,
  input: {
    label: string;
    billingMode: ModelAccess;
    description: string | null;
    sortOrder: number;
  },
): GroupMutation {
  const current = readGroup(slug);

  if (!current) {
    return { ok: false, status: 404, error: "Group not found." };
  }

  if (current.is_system === 1 && current.billing_mode !== input.billingMode) {
    return {
      ok: false,
      status: 400,
      error: "A system group's billing mode cannot be changed.",
    };
  }

  if (labelExists(input.label, slug)) {
    return {
      ok: false,
      status: 409,
      error: "A group with that label already exists.",
    };
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE model_groups
       SET label = ?, billing_mode = ?, description = ?, sort_order = ?,
           updated_at = ?
       WHERE slug = ?`,
    ).run(
      input.label,
      input.billingMode,
      input.description,
      input.sortOrder,
      nowIso(),
      slug,
    );

    if (input.billingMode === "free") {
      db.prepare(
        `UPDATE models
         SET sell_input_micros = 0, sell_output_micros = 0
         WHERE group_slug = ?`,
      ).run(slug);
    }
  })();

  return { ok: true, group: getModelGroup(slug)! };
}

export type AssignGroupResult = "ok" | "model_not_found" | "group_not_found";

export function assignModelGroup(
  modelId: string,
  slug: string,
): AssignGroupResult {
  const group = readGroup(slug);

  if (!group) return "group_not_found";

  const model = db
    .prepare("SELECT id FROM models WHERE id = ?")
    .get(modelId) as { id: string } | undefined;

  if (!model) return "model_not_found";

  db.transaction(() => {
    db.prepare(
      `UPDATE models
       SET group_slug = ?, group_source = 'manual'
       WHERE id = ?`,
    ).run(slug, modelId);

    if (group.billing_mode === "free") {
      db.prepare(
        `UPDATE models
         SET sell_input_micros = 0, sell_output_micros = 0
         WHERE id = ?`,
      ).run(modelId);
    }
  })();

  return "ok";
}

export function deleteModelGroup(
  slug: string,
  reassignTo: string,
): { ok: true } | { ok: false; status: 400 | 404; error: string } {
  const current = readGroup(slug);

  if (!current) {
    return { ok: false, status: 404, error: "Group not found." };
  }

  if (current.is_system === 1) {
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

  const destination = readGroup(reassignTo);

  if (!destination) {
    return {
      ok: false,
      status: 400,
      error: "The destination group does not exist.",
    };
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE models
       SET group_slug = ?, group_source = 'manual'
       WHERE group_slug = ?`,
    ).run(reassignTo, slug);

    if (destination.billing_mode === "free") {
      db.prepare(
        `UPDATE models
         SET sell_input_micros = 0, sell_output_micros = 0
         WHERE group_slug = ?`,
      ).run(reassignTo);
    }

    db.prepare("DELETE FROM model_groups WHERE slug = ?").run(slug);
  })();

  return { ok: true };
}
