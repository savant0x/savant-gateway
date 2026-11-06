import type { PostgresDatabase } from "../pg-adapter.ts";
import type { PelicanSnapshot } from "../../visual-builds/pelican.ts";
import type { OpenRouterSnapshot } from "../../visual-builds/openrouter.ts";

import { randomUUID } from "node:crypto";

import {
  type AdminVisualBuildRow,
  type VisualBuildVisibility,
  catalogIdentityDigest,
  sha256Hex,
} from "../../visual-builds/types.ts";
import {
  matchVisualBuild,
  type ShowcaseAlias,
} from "../../visual-builds/matching.ts";

import { getShowcaseSource, putShowcaseAsset } from "./showcase-sources.ts";
import {
  catalogModel,
  loadCatalogModel,
  type BindingRow,
  type CatalogRow,
} from "./showcase-bindings.ts";

/**
 * Build, revision and admin-review persistence. Bindings and publication live
 * in separate modules; every one of those helpers is re-exported here so the
 * façade keeps one stable surface.
 */

async function loadCatalog(
  db: PostgresDatabase,
): Promise<ReturnType<typeof catalogModel>[]> {
  const rows = await db
    .prepare(
      `SELECT id, upstream_id, name, provider, in_catalog, status
         FROM models WHERE in_catalog = 1 AND status = 'active'`,
    )
    .all<CatalogRow>();

  return rows.map((row) => catalogModel(row));
}

async function loadAliases(
  db: PostgresDatabase,
  sourceId: string,
): Promise<ShowcaseAlias[]> {
  const rows = await db
    .prepare(
      `SELECT external_model_id, model_id FROM showcase.model_aliases
        WHERE source_id = ? AND state = 'active'`,
    )
    .all<{ external_model_id: string; model_id: string }>(sourceId);

  return rows.map((row) => ({
    externalModelId: row.external_model_id,
    modelId: row.model_id,
  }));
}

export type SnapshotPersistResult = {
  buildId: string;
  revisionId: string;
  created: boolean;
  match: ReturnType<typeof matchVisualBuild>;
};

/**
 * Persists one verified snapshot. The revision key is the raw record hash:
 * re-importing an unchanged record reuses its revision and review history.
 */
export async function persistShowcaseSnapshot(
  db: PostgresDatabase,
  sourceId: string,
  snapshot: PelicanSnapshot | OpenRouterSnapshot,
): Promise<SnapshotPersistResult> {
  const source = await getShowcaseSource(db, sourceId);

  if (!source || !source.enabled) {
    throw new Error("The showcase source is missing or disabled.");
  }
  if (snapshot.source.id !== sourceId) {
    throw new Error("The snapshot belongs to a different source.");
  }

  const artifact = await putShowcaseAsset(db, sourceId, {
    sha256: snapshot.artifactSha256,
    mime: snapshot.artifactMime,
    kind: "artifact",
    bytes: snapshot.artifactBytes,
  });
  const thumbnail = snapshot.thumbnailBytes
    ? await putShowcaseAsset(db, sourceId, {
        sha256: snapshot.thumbnailSha256 as string,
        mime: "image/jpeg",
        kind: "thumbnail",
        bytes: snapshot.thumbnailBytes,
      })
    : null;
  const now = new Date().toISOString();

  return db.transaction(async () => {
    const build = await db
      .prepare(
        `INSERT INTO showcase.builds
          (id, source_id, external_id, visibility, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, ?)
         ON CONFLICT (source_id, external_id) DO UPDATE SET
           updated_at = EXCLUDED.updated_at
         RETURNING id`,
      )
      .get<{ id: string }>(
        `bld_${sha256Hex(`${sourceId}\0${snapshot.record.externalId}`).slice(0, 32)}`,
        sourceId,
        snapshot.record.externalId,
        now,
        now,
      );

    if (!build) throw new Error("The showcase build could not be persisted.");

    const revisionId = `rev_${sha256Hex(
      `${build.id}\0${snapshot.rawRecordSha256}`,
    ).slice(0, 32)}`;
    const inserted = await db
      .prepare(
        `INSERT INTO showcase.revisions
          (id, build_id, revision_key, source_id, source_url, source_revision,
           title, description, original_model_id, original_model_label, creator,
           provider, task, effort, harness, source_status, validation_state,
           source_created_at, prompt_text, prompt_sha256, raw_record_json,
           raw_record_sha256, cost_usd_micros, generation_ms, artifact_asset_id,
           thumbnail_asset_id, license_text, license_sha256, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (build_id, revision_key) DO NOTHING
         RETURNING id`,
      )
      .get<{ id: string }>(
        revisionId,
        build.id,
        snapshot.rawRecordSha256,
        sourceId,
        snapshot.sourceUrl,
        source.revision,
        snapshot.record.title,
        snapshot.record.description,
        snapshot.record.originalModelId,
        snapshot.record.originalModelLabel,
        snapshot.record.creator,
        snapshot.record.provider,
        snapshot.record.task,
        snapshot.record.effort,
        snapshot.record.harness,
        snapshot.record.sourceStatus,
        snapshot.record.validationState,
        snapshot.record.sourceCreatedAt,
        snapshot.promptText,
        snapshot.promptSha256,
        snapshot.rawRecordJson,
        snapshot.rawRecordSha256,
        snapshot.record.costUsdMicros,
        snapshot.record.generationMs,
        artifact.id,
        thumbnail?.id ?? null,
        snapshot.licenseText,
        snapshot.licenseSha256,
        now,
      );
    const created = Boolean(inserted);
    const finalRevisionId = inserted?.id ?? revisionId;
    const existing = await db
      .prepare(
        `SELECT id FROM showcase.revisions WHERE id = ? AND build_id = ?`,
      )
      .get<{ id: string }>(finalRevisionId, build.id);

    if (!existing) throw new Error("The showcase revision was not readable.");

    const binding = await db
      .prepare(`SELECT * FROM showcase.bindings WHERE revision_id = ?`)
      .get<BindingRow>(finalRevisionId);
    let match: ReturnType<typeof matchVisualBuild>;

    if (!binding) {
      match = matchVisualBuild({
        originalModelId: snapshot.record.originalModelId,
        originalModelLabel: snapshot.record.originalModelLabel,
        models: (await loadCatalog(db)).filter(
          (model): model is NonNullable<typeof model> => model !== null,
        ),
        aliases: await loadAliases(db, sourceId),
      });
      const model = match.modelId
        ? await loadCatalogModel(db, match.modelId)
        : null;
      const digest = catalogIdentityDigest(model);
      const state = match.state === "matched" ? "accepted" : "pending";
      const method =
        match.state !== "matched"
          ? "suggested"
          : match.method === "operator_alias"
            ? "operator"
            : "exact_id";

      await db
        .prepare(
          `INSERT INTO showcase.bindings
            (id, revision_id, model_id, state, method, reason, catalog_digest,
             reviewer, reviewed_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
        )
        .run(
          `bnd_${randomUUID()}`,
          finalRevisionId,
          match.modelId,
          state,
          method,
          match.reason,
          digest,
          now,
        );
    } else {
      match = {
        state:
          binding.state === "accepted"
            ? "matched"
            : binding.state === "rejected"
              ? "unmatched"
              : "suggestion",
        modelId: binding.model_id,
        candidateIds: binding.model_id ? [binding.model_id] : [],
        method:
          binding.method === "operator"
            ? "operator_alias"
            : binding.method === "exact_id"
              ? "exact_id"
              : "name_suggestion",
        reason: binding.reason,
      };
    }

    return { buildId: build.id, revisionId: finalRevisionId, created, match };
  })();
}

type AdminRow = {
  build_id: string;
  revision_id: string;
  source_id: string;
  source_label: string;
  external_id: string;
  visibility: VisualBuildVisibility;
  withdrawal_note: string | null;
  published_at: string | null;
  title: string;
  description: string;
  original_model_id: string;
  original_model_label: string;
  creator: string;
  effort: string;
  source_status: string;
  validation_state: string;
  source_url: string;
  source_created_at: string | null;
  model_id: string | null;
  model_name: string | null;
  model_family: string | null;
  model_upstream_id: string | null;
  model_in_catalog: number | null;
  model_status: string | null;
  binding_state: "pending" | "accepted" | "rejected";
  binding_method: "exact_id" | "operator" | "suggested";
  binding_reason: string;
  catalog_digest: string;
  thumbnail_asset_id: string | null;
  artifact_asset_id: string;
  raw_record_json: string;
  rights_attribution: string | null;
  license_text: string | null;
  artifact_sha256: string;
};

function adminRow(row: AdminRow): AdminVisualBuildRow {
  const model = catalogModel({
    id: row.model_id ?? "",
    upstream_id: row.model_upstream_id ?? "",
    name: row.model_name ?? "",
    provider: row.model_family ?? "",
    in_catalog: row.model_in_catalog ?? 0,
    status: row.model_status ?? "",
  });

  return {
    buildId: row.build_id,
    revisionId: row.revision_id,
    sourceId: row.source_id,
    sourceLabel: row.source_label,
    externalId: row.external_id,
    title: row.title || row.external_id,
    description: row.description,
    originalModelId: row.original_model_id,
    originalModelLabel: row.original_model_label,
    creator: row.creator,
    effort: row.effort,
    sourceStatus: row.source_status,
    validationState: row.validation_state,
    sourceUrl: row.source_url,
    sourceCreatedAt: row.source_created_at,
    modelId: row.model_id ?? "",
    modelName: row.model_name ?? "",
    modelFamily: row.model_family ?? "",
    thumbnailSha256: null,
    artifactSha256: row.artifact_sha256,
    rightsAttribution: row.rights_attribution ?? "",
    licenseText: row.license_text ?? "",
    publishedAt: row.published_at ?? "",
    visibility: row.visibility,
    bindingState: row.binding_state,
    bindingMethod: row.binding_method,
    bindingReason: row.binding_reason,
    catalogDigestMatches:
      model !== null && catalogIdentityDigest(model) === row.catalog_digest,
    thumbnailAssetId: row.thumbnail_asset_id,
    artifactAssetId: row.artifact_asset_id,
    withdrawalNote: row.withdrawal_note,
  };
}

const ADMIN_SELECT = `
  SELECT b.id AS build_id, r.id AS revision_id, b.source_id, s.label AS source_label,
         b.external_id, b.visibility, b.withdrawal_note, b.published_at,
         r.original_model_id, r.original_model_label, r.creator, r.effort,
         r.source_status, r.validation_state, r.source_url, r.source_created_at,
         r.title, r.description, r.artifact_asset_id, r.thumbnail_asset_id,
         r.raw_record_json, r.license_text, a.sha256 AS artifact_sha256,
         bd.model_id, m.name AS model_name, m.provider AS model_family,
         m.upstream_id AS model_upstream_id, m.in_catalog AS model_in_catalog,
         m.status AS model_status, bd.state AS binding_state,
         bd.method AS binding_method, bd.reason AS binding_reason,
         bd.catalog_digest, rt.attribution AS rights_attribution
    FROM showcase.builds b
    JOIN showcase.sources s ON s.id = b.source_id
    JOIN showcase.revisions r ON r.id = COALESCE(
      b.published_revision_id,
      (SELECT rr.id FROM showcase.revisions rr WHERE rr.build_id = b.id
        ORDER BY rr.created_at DESC LIMIT 1)
    )
    JOIN showcase.assets a ON a.id = r.artifact_asset_id
    LEFT JOIN showcase.bindings bd ON bd.revision_id = r.id
    LEFT JOIN models m ON m.id = bd.model_id
    LEFT JOIN showcase.source_rights rt ON rt.source_id = b.source_id
      AND rt.superseded_by IS NULL AND rt.state = 'approved'
`;

export async function listAdminShowcaseBuilds(
  db: PostgresDatabase,
  limit = 50,
): Promise<AdminVisualBuildRow[]> {
  const rows = await db
    .prepare(
      `${ADMIN_SELECT}
       ORDER BY b.updated_at DESC, b.id ASC LIMIT ?`,
    )
    .all<AdminRow>(Math.min(100, Math.max(1, limit)));

  return rows.map(adminRow);
}

export async function getAdminShowcaseBuild(
  db: PostgresDatabase,
  buildId: string,
): Promise<AdminVisualBuildRow | null> {
  const row = await db
    .prepare(`${ADMIN_SELECT} WHERE b.id = ? LIMIT 1`)
    .get<AdminRow>(buildId);

  return row ? adminRow(row) : null;
}

export {
  acceptShowcaseBinding,
  getShowcaseBinding,
  rejectShowcaseBinding,
} from "./showcase-bindings.ts";
export {
  publishShowcaseBuild,
  withdrawShowcaseBuild,
} from "./showcase-publishing.ts";
export type { PublishResult } from "./showcase-publishing.ts";
