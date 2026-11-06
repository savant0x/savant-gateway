import type { PostgresDatabase } from "../pg-adapter.ts";

import { randomUUID } from "node:crypto";

import {
  VISUAL_BUILD_LIMITS,
  type RightsState,
  type VisualBuildRights,
  type VisualBuildSource,
  rightsApproved,
} from "../../visual-builds/types.ts";

/**
 * Showcase source, rights and lease persistence.
 *
 * Rights are append-only: an approval is a row, and a later decision supersedes
 * it rather than editing history. This is what lets a published build become
 * unavailable immediately when the operator withdraws a permission.
 */

type SourceRow = {
  id: string;
  kind: "pelican_sdf";
  label: string;
  base_url: string;
  revision: string;
  enabled: number;
  max_storage_bytes: number | string;
  created_at: string;
  updated_at: string;
};

type RightsRow = {
  id: string;
  source_id: string;
  state: RightsState;
  evidence_url: string;
  evidence_note: string;
  evidence_sha256: string;
  license_text: string;
  license_sha256: string;
  attribution: string;
  display_allowed: number;
  cache_allowed: number;
  redistribute_allowed: number;
  reviewer: string;
  reviewed_at: string;
  superseded_by: string | null;
  created_at: string;
};

export type AppendRightsInput = {
  sourceId: string;
  state: RightsState;
  evidenceUrl: string;
  evidenceNote: string;
  evidenceSha256: string;
  licenseText: string;
  licenseSha256: string;
  attribution: string;
  displayAllowed: boolean;
  cacheAllowed: boolean;
  redistributeAllowed: boolean;
  reviewer: string;
  reviewedAt: string;
};

function sourceRow(row: SourceRow): VisualBuildSource {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    baseUrl: row.base_url,
    revision: row.revision,
    enabled: row.enabled === 1,
    maxStorageBytes: Number(row.max_storage_bytes),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rightsRow(row: RightsRow): VisualBuildRights {
  return {
    id: row.id,
    sourceId: row.source_id,
    state: row.state,
    evidenceUrl: row.evidence_url,
    evidenceNote: row.evidence_note,
    evidenceSha256: row.evidence_sha256,
    licenseText: row.license_text,
    licenseSha256: row.license_sha256,
    attribution: row.attribution,
    displayAllowed: row.display_allowed === 1,
    cacheAllowed: row.cache_allowed === 1,
    redistributeAllowed: row.redistribute_allowed === 1,
    reviewer: row.reviewer,
    reviewedAt: row.reviewed_at,
    supersededBy: row.superseded_by,
    createdAt: row.created_at,
  };
}

export async function upsertShowcaseSource(
  db: PostgresDatabase,
  input: Omit<VisualBuildSource, "kind" | "createdAt" | "updatedAt">,
): Promise<VisualBuildSource> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO showcase.sources
        (id, kind, label, base_url, revision, enabled, max_storage_bytes,
         created_at, updated_at)
       VALUES (?, 'pelican_sdf', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         label = EXCLUDED.label,
         base_url = EXCLUDED.base_url,
         revision = EXCLUDED.revision,
         max_storage_bytes = EXCLUDED.max_storage_bytes,
         updated_at = EXCLUDED.updated_at`,
    )
    .run(
      input.id,
      input.label,
      input.baseUrl,
      input.revision,
      input.enabled ? 1 : 0,
      input.maxStorageBytes,
      now,
      now,
    );

  const saved = await getShowcaseSource(db, input.id);

  if (!saved) throw new Error("The showcase source disappeared after upsert.");

  return saved;
}

export async function getShowcaseSource(
  db: PostgresDatabase,
  sourceId: string,
): Promise<VisualBuildSource | null> {
  const row = await db
    .prepare(`SELECT * FROM showcase.sources WHERE id = ?`)
    .get<SourceRow>(sourceId);

  return row ? sourceRow(row) : null;
}

export async function listShowcaseSources(
  db: PostgresDatabase,
): Promise<VisualBuildSource[]> {
  const rows = await db
    .prepare(`SELECT * FROM showcase.sources ORDER BY label ASC, id ASC`)
    .all<SourceRow>();

  return rows.map(sourceRow);
}

export async function setShowcaseSourceEnabled(
  db: PostgresDatabase,
  sourceId: string,
  enabled: boolean,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE showcase.sources SET enabled = ?, updated_at = ? WHERE id = ?`,
    )
    .run(enabled ? 1 : 0, new Date().toISOString(), sourceId);

  return result.changes === 1;
}

export async function currentShowcaseRights(
  db: PostgresDatabase,
  sourceId: string,
): Promise<VisualBuildRights | null> {
  const row = await db
    .prepare(
      `SELECT * FROM showcase.source_rights
        WHERE source_id = ? AND superseded_by IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get<RightsRow>(sourceId);

  return row ? rightsRow(row) : null;
}

export async function listShowcaseRights(
  db: PostgresDatabase,
  sourceId: string,
  limit = 20,
): Promise<VisualBuildRights[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM showcase.source_rights
        WHERE source_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all<RightsRow>(sourceId, Math.min(50, Math.max(1, limit)));

  return rows.map(rightsRow);
}

export function rightsInputProblem(input: AppendRightsInput): string | null {
  if (!input.reviewer.trim()) return "A rights decision needs a reviewer.";
  if (!input.evidenceUrl.startsWith("https://")) {
    return "Rights evidence must be an https URL.";
  }
  if (!input.evidenceNote.trim()) return "Rights evidence needs a note.";
  if (!/^[a-f0-9]{64}$/.test(input.evidenceSha256)) {
    return "Rights evidence needs a SHA-256.";
  }
  if (input.licenseText.length > VISUAL_BUILD_LIMITS.licenseBytes) {
    return "The license text is too large.";
  }
  if (
    input.state === "approved" &&
    rightsApproved({ ...input, id: "x", supersededBy: null, createdAt: "" }) ===
      false
  ) {
    return "An approved decision must allow display, cache and redistribution.";
  }

  return null;
}

/**
 * Appends a decision and supersedes every prior current row. The new row is
 * inserted as `pending` first so the partial unique approval index cannot see
 * two current approvals during the handover.
 */
export async function appendShowcaseRights(
  db: PostgresDatabase,
  input: AppendRightsInput,
): Promise<VisualBuildRights> {
  const problem = rightsInputProblem(input);

  if (problem) throw new Error(problem);
  if (!(await getShowcaseSource(db, input.sourceId))) {
    throw new Error("The showcase source does not exist.");
  }

  const id = `rgt_${randomUUID()}`;
  const now = new Date().toISOString();

  await db.transaction(async () => {
    await db
      .prepare(
        `INSERT INTO showcase.source_rights
          (id, source_id, state, evidence_url, evidence_note, evidence_sha256,
           license_text, license_sha256, attribution, display_allowed,
           cache_allowed, redistribute_allowed, reviewer, reviewed_at,
           superseded_by, created_at)
         VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .run(
        id,
        input.sourceId,
        input.evidenceUrl,
        input.evidenceNote,
        input.evidenceSha256,
        input.licenseText,
        input.licenseSha256,
        input.attribution,
        input.displayAllowed ? 1 : 0,
        input.cacheAllowed ? 1 : 0,
        input.redistributeAllowed ? 1 : 0,
        input.reviewer,
        input.reviewedAt,
        now,
      );
    await db
      .prepare(
        `UPDATE showcase.source_rights
            SET superseded_by = ?
          WHERE source_id = ? AND id <> ? AND superseded_by IS NULL`,
      )
      .run(id, input.sourceId, id);
    await db
      .prepare(`UPDATE showcase.source_rights SET state = ? WHERE id = ?`)
      .run(input.state, id);
  })();

  const saved = await db
    .prepare(`SELECT * FROM showcase.source_rights WHERE id = ?`)
    .get<RightsRow>(id);

  if (!saved) throw new Error("The rights decision disappeared after append.");

  return rightsRow(saved);
}

export async function claimShowcaseImport(
  db: PostgresDatabase,
  sourceId: string,
  ownerToken: string,
  leaseMs = 10 * 60_000,
): Promise<{ id: string; claimed: boolean; leaseExpiresAt: string }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();

  await db
    .prepare(
      `UPDATE showcase.import_runs
          SET status = 'failed', finished_at = ?,
              error = COALESCE(error, 'Import lease expired.')
        WHERE source_id = ? AND status = 'running' AND lease_expires_at < ?`,
    )
    .run(nowIso, sourceId, nowIso);

  const id = `imp_${randomUUID()}`;
  const result = await db
    .prepare(
      `INSERT INTO showcase.import_runs
        (id, source_id, owner_token, lease_expires_at, status, started_at)
       VALUES (?, ?, ?, ?, 'running', ?)
       ON CONFLICT DO NOTHING`,
    )
    .run(id, sourceId, ownerToken, leaseExpiresAt, nowIso);

  return { id, claimed: result.changes === 1, leaseExpiresAt };
}

export async function finishShowcaseImport(
  db: PostgresDatabase,
  input: {
    runId: string;
    ownerToken: string;
    status: "ok" | "failed";
    seen: number;
    imported: number;
    skipped: number;
    error: string | null;
  },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE showcase.import_runs
          SET status = ?, finished_at = ?, seen = ?, imported = ?, skipped = ?,
              error = ?
        WHERE id = ? AND owner_token = ? AND status = 'running'`,
    )
    .run(
      input.status,
      new Date().toISOString(),
      input.seen,
      input.imported,
      input.skipped,
      input.error,
      input.runId,
      input.ownerToken,
    );

  return result.changes === 1;
}

export {
  ShowcaseAssetError,
  putShowcaseAsset,
  readShowcaseAsset,
  showcaseStorageUsage,
} from "./showcase-assets.ts";
export type { PutAssetInput } from "./showcase-assets.ts";
