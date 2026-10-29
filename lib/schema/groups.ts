import type { DatabaseHandle } from "./columns";

import { SYSTEM_GROUP_DEFINITIONS } from "../model-groups";

import { ensureColumn } from "./columns";

/**
 * First-class model groups. Additive: existing rows are backfilled to the
 * system group matching their old provider-derived access, so a deployment
 * keeps its current billing behavior until an operator assigns a group.
 */
export function modelGroupSchema(database: DatabaseHandle) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS model_groups (
      slug TEXT PRIMARY KEY,
      label TEXT NOT NULL COLLATE NOCASE UNIQUE,
      billing_mode TEXT NOT NULL
        CHECK (billing_mode IN ('free', 'paid', 'subscription')),
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  ensureColumn(database, "models", "group_slug", "TEXT");
  ensureColumn(
    database,
    "models",
    "group_source",
    "TEXT NOT NULL DEFAULT 'auto' CHECK (group_source IN ('auto', 'manual'))",
  );
  ensureColumn(database, "usage_events", "group_slug", "TEXT");

  database.exec(`
    CREATE INDEX IF NOT EXISTS models_group_idx ON models(group_slug);
    CREATE INDEX IF NOT EXISTS model_groups_order_idx
      ON model_groups(sort_order, label);
  `);

  const now = new Date().toISOString();
  const insertGroup = database.prepare(`
    INSERT OR IGNORE INTO model_groups
      (slug, label, billing_mode, description, sort_order, is_system,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const group of SYSTEM_GROUP_DEFINITIONS) {
    insertGroup.run(
      group.slug,
      group.label,
      group.billingMode,
      group.description,
      group.sortOrder,
      group.isSystem ? 1 : 0,
      now,
      now,
    );
  }

  // System groups own their slug and billing behavior. Labels, descriptions,
  // and order remain operator-editable.
  database.exec(`
    UPDATE model_groups SET is_system = 1
    WHERE slug IN ('free', 'paid', 'subscription');
    UPDATE model_groups SET billing_mode = 'free' WHERE slug = 'free';
    UPDATE model_groups SET billing_mode = 'paid' WHERE slug = 'paid';
    UPDATE model_groups SET billing_mode = 'subscription'
    WHERE slug = 'subscription';

    UPDATE models
    SET group_slug = CASE
      WHEN allow_free = 1 AND token_weight > 0 THEN 'free'
      WHEN upstream_id LIKE 'free/%' THEN 'subscription'
      ELSE 'paid'
    END
    WHERE group_slug IS NULL OR group_slug = '';
  `);
}
