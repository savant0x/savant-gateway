import type { PostgresDatabase } from "../pg-adapter.ts";

import {
  type CatalogModelForShowcase,
  type VisualBuildBinding,
  catalogIdentityDigest,
} from "../../visual-builds/types.ts";

/**
 * Catalog identity and binding persistence. The digest is the reviewed
 * identity; a later rename or delisting makes the binding stale on every read.
 */

export type CatalogRow = {
  id: string;
  upstream_id: string;
  name: string;
  provider: string;
  in_catalog: number;
  status: string;
};

export function catalogModel(
  row: CatalogRow | undefined,
): CatalogModelForShowcase | null {
  return row
    ? {
        id: row.id,
        upstreamId: row.upstream_id,
        name: row.name,
        family: row.provider,
        inCatalog: row.in_catalog === 1,
        status: row.status,
      }
    : null;
}

export async function loadCatalogModel(
  db: PostgresDatabase,
  modelId: string,
): Promise<CatalogModelForShowcase | null> {
  const row = await db
    .prepare(
      `SELECT id, upstream_id, name, provider, in_catalog, status
         FROM models WHERE id = ?`,
    )
    .get<CatalogRow>(modelId);

  return catalogModel(row);
}

export type BindingRow = {
  id: string;
  revision_id: string;
  model_id: string | null;
  state: "pending" | "accepted" | "rejected";
  method: "exact_id" | "operator" | "suggested";
  reason: string;
  catalog_digest: string;
  reviewer: string | null;
  reviewed_at: string | null;
  created_at: string;
};

function bindingRow(row: BindingRow): VisualBuildBinding {
  return {
    id: row.id,
    revisionId: row.revision_id,
    modelId: row.model_id ?? "",
    state: row.state,
    method: row.method,
    reason: row.reason,
    catalogDigest: row.catalog_digest,
    reviewer: row.reviewer,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

export async function getShowcaseBinding(
  db: PostgresDatabase,
  revisionId: string,
): Promise<VisualBuildBinding | null> {
  const row = await db
    .prepare(`SELECT * FROM showcase.bindings WHERE revision_id = ?`)
    .get<BindingRow>(revisionId);

  return row ? bindingRow(row) : null;
}

export async function acceptShowcaseBinding(
  db: PostgresDatabase,
  input: {
    revisionId: string;
    modelId: string;
    reviewer: string;
    note: string;
  },
): Promise<{ ok: boolean; code: string }> {
  if (!input.reviewer.trim()) return { ok: false, code: "reviewer" };

  const model = await loadCatalogModel(db, input.modelId);

  if (!model || !model.inCatalog || model.status !== "active") {
    return { ok: false, code: "model" };
  }

  const binding = await getShowcaseBinding(db, input.revisionId);

  if (!binding) return { ok: false, code: "not_found" };

  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE showcase.bindings
          SET model_id = ?, state = 'accepted', method = 'operator',
              reason = ?, catalog_digest = ?, reviewer = ?, reviewed_at = ?
        WHERE revision_id = ?`,
    )
    .run(
      input.modelId,
      input.note.trim() || "Operator accepted this exact catalog model.",
      catalogIdentityDigest(model),
      input.reviewer,
      now,
      input.revisionId,
    );

  return { ok: true, code: "accepted" };
}

export async function rejectShowcaseBinding(
  db: PostgresDatabase,
  revisionId: string,
  reviewer: string,
  note: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE showcase.bindings
          SET state = 'rejected', reviewer = ?, reviewed_at = ?, reason = ?
        WHERE revision_id = ?`,
    )
    .run(
      reviewer,
      new Date().toISOString(),
      note.trim() || "Rejected by operator.",
      revisionId,
    );

  return result.changes === 1;
}
