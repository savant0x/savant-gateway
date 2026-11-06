import type { PostgresDatabase } from "../pg-adapter.ts";

import {
  VISUAL_BUILD_LIMITS,
  type VisualBuildPublicRow,
  catalogIdentityDigest,
} from "../../visual-builds/types.ts";
import { packageVisualArtifact } from "../../visual-builds/packaging.ts";

import { readShowcaseAsset } from "./showcase-sources.ts";

/**
 * Public projections for published visual builds.
 *
 * Every read repeats the same gate: the source is enabled, the build is
 * published, the current rights decision allows display/cache/redistribution,
 * the binding is accepted, the model is active in the catalog, and the catalog
 * digest still matches the identity that was reviewed. A withdrawn permission
 * therefore removes the page and the bundle on the next request.
 */

type PublicRow = {
  build_id: string;
  revision_id: string;
  source_id: string;
  source_label: string;
  external_id: string;
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
  model_id: string;
  model_name: string;
  model_family: string;
  model_upstream_id: string;
  model_in_catalog: number;
  model_status: string;
  catalog_digest: string;
  thumbnail_sha256: string | null;
  artifact_sha256: string;
  rights_attribution: string;
  license_text: string;
  published_at: string;
};

const PUBLIC_SELECT = `
  SELECT b.id AS build_id, r.id AS revision_id, b.source_id, s.label AS source_label,
         b.external_id, r.title, r.description, r.original_model_id,
         r.original_model_label, r.creator, r.effort, r.source_status,
         r.validation_state, r.source_url, r.source_created_at,
         bd.model_id, m.name AS model_name, m.provider AS model_family,
         m.upstream_id AS model_upstream_id, m.in_catalog AS model_in_catalog,
         m.status AS model_status, bd.catalog_digest,
         th.sha256 AS thumbnail_sha256, a.sha256 AS artifact_sha256,
         rt.attribution AS rights_attribution, r.license_text,
         COALESCE(b.published_at, b.updated_at) AS published_at
    FROM showcase.builds b
    JOIN showcase.sources s ON s.id = b.source_id AND s.enabled = 1
    JOIN showcase.revisions r ON r.id = b.published_revision_id
    JOIN showcase.bindings bd ON bd.revision_id = r.id AND bd.state = 'accepted'
    JOIN models m ON m.id = bd.model_id AND m.in_catalog = 1 AND m.status = 'active'
    JOIN showcase.assets a ON a.id = r.artifact_asset_id
    LEFT JOIN showcase.assets th ON th.id = r.thumbnail_asset_id
    JOIN showcase.source_rights rt ON rt.source_id = b.source_id
      AND rt.superseded_by IS NULL AND rt.state = 'approved'
      AND rt.display_allowed = 1 AND rt.cache_allowed = 1
      AND rt.redistribute_allowed = 1
   WHERE b.visibility = 'published'
`;

function rowDigestMatches(row: PublicRow): boolean {
  return (
    catalogIdentityDigest({
      id: row.model_id,
      upstreamId: row.model_upstream_id,
      name: row.model_name,
      family: row.model_family,
      inCatalog: row.model_in_catalog === 1,
      status: row.model_status,
    }) === row.catalog_digest
  );
}

function publicRow(row: PublicRow): VisualBuildPublicRow {
  return {
    buildId: row.build_id,
    revisionId: row.revision_id,
    sourceId: row.source_id,
    sourceLabel: row.source_label,
    externalId: row.external_id,
    title: row.title,
    description: row.description,
    originalModelId: row.original_model_id,
    originalModelLabel: row.original_model_label,
    creator: row.creator,
    effort: row.effort,
    sourceStatus: row.source_status,
    validationState: row.validation_state,
    sourceUrl: row.source_url,
    sourceCreatedAt: row.source_created_at,
    modelId: row.model_id,
    modelName: row.model_name,
    modelFamily: row.model_family,
    thumbnailSha256: row.thumbnail_sha256,
    artifactSha256: row.artifact_sha256,
    rightsAttribution: row.rights_attribution,
    licenseText: row.license_text,
    publishedAt: row.published_at,
  };
}

function usable(row: PublicRow): boolean {
  return rowDigestMatches(row);
}

export async function listPublishedVisualBuilds(
  db: PostgresDatabase,
  options: { modelId?: string; limit?: number } = {},
): Promise<VisualBuildPublicRow[]> {
  const limit = Math.min(
    VISUAL_BUILD_LIMITS.maxPageSize,
    Math.max(1, options.limit ?? VISUAL_BUILD_LIMITS.pageSize),
  );
  const rows = options.modelId
    ? await db
        .prepare(
          `${PUBLIC_SELECT} AND bd.model_id = ?
           ORDER BY b.published_at DESC, b.id ASC LIMIT ?`,
        )
        .all<PublicRow>(options.modelId, limit)
    : await db
        .prepare(
          `${PUBLIC_SELECT}
           ORDER BY b.published_at DESC, b.id ASC LIMIT ?`,
        )
        .all<PublicRow>(limit);

  return rows.filter(usable).map(publicRow);
}

export async function getPublishedVisualBuild(
  db: PostgresDatabase,
  buildId: string,
): Promise<VisualBuildPublicRow | null> {
  const row = await db
    .prepare(`${PUBLIC_SELECT} AND b.id = ? LIMIT 1`)
    .get<PublicRow>(buildId);

  return row && usable(row) ? publicRow(row) : null;
}

export async function getPublishedVisualBundle(
  db: PostgresDatabase,
  buildId: string,
): Promise<{
  build: VisualBuildPublicRow;
  html: string;
  sha256: string;
} | null> {
  const row = await db
    .prepare(
      `SELECT b.id AS build_id, r.id AS revision_id, b.source_id,
              s.label AS source_label, b.external_id, r.title, r.description,
              r.original_model_id, r.original_model_label, r.creator, r.effort,
              r.source_status, r.validation_state, r.source_url,
              r.source_created_at, bd.model_id, m.name AS model_name,
              m.provider AS model_family, m.upstream_id AS model_upstream_id,
              m.in_catalog AS model_in_catalog, m.status AS model_status,
              bd.catalog_digest, th.sha256 AS thumbnail_sha256,
              a.sha256 AS artifact_sha256, rt.attribution AS rights_attribution,
              r.license_text, COALESCE(b.published_at, b.updated_at) AS published_at,
              r.artifact_asset_id
         FROM showcase.builds b
         JOIN showcase.sources s ON s.id = b.source_id AND s.enabled = 1
         JOIN showcase.revisions r ON r.id = b.published_revision_id
         JOIN showcase.bindings bd ON bd.revision_id = r.id AND bd.state = 'accepted'
         JOIN models m ON m.id = bd.model_id AND m.in_catalog = 1 AND m.status = 'active'
         JOIN showcase.assets a ON a.id = r.artifact_asset_id
         LEFT JOIN showcase.assets th ON th.id = r.thumbnail_asset_id
         JOIN showcase.source_rights rt ON rt.source_id = b.source_id
           AND rt.superseded_by IS NULL AND rt.state = 'approved'
           AND rt.display_allowed = 1 AND rt.cache_allowed = 1
           AND rt.redistribute_allowed = 1
        WHERE b.visibility = 'published' AND b.id = ?
        LIMIT 1`,
    )
    .get<PublicRow & { artifact_asset_id: string }>(buildId);

  if (!row || !usable(row)) return null;

  const asset = await readShowcaseAsset(db, row.artifact_asset_id);

  if (!asset) return null;

  try {
    const packaged = packageVisualArtifact(asset.mime, asset.bytes);

    return {
      build: publicRow(row),
      html: packaged.html,
      sha256: packaged.sha256,
    };
  } catch {
    return null;
  }
}

export async function getPublishedVisualThumbnail(
  db: PostgresDatabase,
  buildId: string,
): Promise<{ bytes: Uint8Array; sha256: string } | null> {
  const row = await db
    .prepare(
      `SELECT r.thumbnail_asset_id
         FROM showcase.builds b
         JOIN showcase.sources s ON s.id = b.source_id AND s.enabled = 1
         JOIN showcase.revisions r ON r.id = b.published_revision_id
         JOIN showcase.bindings bd ON bd.revision_id = r.id AND bd.state = 'accepted'
         JOIN models m ON m.id = bd.model_id AND m.in_catalog = 1
                      AND m.status = 'active'
         JOIN showcase.source_rights rt ON rt.source_id = b.source_id
           AND rt.superseded_by IS NULL AND rt.state = 'approved'
           AND rt.display_allowed = 1 AND rt.cache_allowed = 1
           AND rt.redistribute_allowed = 1
        WHERE b.visibility = 'published' AND b.id = ? AND r.thumbnail_asset_id IS NOT NULL
        LIMIT 1`,
    )
    .get<{ thumbnail_asset_id: string }>(buildId);

  if (!row) return null;

  const asset = await readShowcaseAsset(db, row.thumbnail_asset_id);

  return asset ? { bytes: asset.bytes, sha256: asset.sha256 } : null;
}
