import type { PostgresDatabase } from "../pg-adapter.ts";

import { randomUUID } from "node:crypto";

import {
  type VisualBuildVisibility,
  catalogIdentityDigest,
  sha256Hex,
} from "../../visual-builds/types.ts";
import { bindingStillValid } from "../../visual-builds/matching.ts";
import { packageVisualArtifact } from "../../visual-builds/packaging.ts";

import { currentShowcaseRights } from "./showcase-sources.ts";
import { readShowcaseAsset } from "./showcase-assets.ts";
import { getShowcaseBinding, loadCatalogModel } from "./showcase-bindings.ts";

/**
 * Publication is a single reviewed snapshot: current rights, accepted binding,
 * unchanged catalog identity, valid artifact and a recorded review row.
 */

export type PublishResult = {
  ok: boolean;
  code:
    | "published"
    | "not_found"
    | "rights"
    | "binding"
    | "stale"
    | "invalid"
    | "already_published";
  reason: string;
};

export async function publishShowcaseBuild(
  db: PostgresDatabase,
  input: { buildId: string; reviewer: string; note: string },
): Promise<PublishResult> {
  if (!input.reviewer.trim()) {
    return { ok: false, code: "invalid", reason: "A reviewer is required." };
  }

  return db.transaction<PublishResult>(async () => {
    const build = await db
      .prepare(`SELECT * FROM showcase.builds WHERE id = ? FOR UPDATE`)
      .get<{
        id: string;
        source_id: string;
        visibility: VisualBuildVisibility;
        published_revision_id: string | null;
      }>(input.buildId);

    if (!build) {
      return { ok: false, code: "not_found", reason: "Build not found." };
    }
    if (build.visibility === "published" && build.published_revision_id) {
      return {
        ok: false,
        code: "already_published",
        reason: "This build is already published.",
      };
    }

    const latest = await db
      .prepare(
        `SELECT id FROM showcase.revisions WHERE build_id = ?
          ORDER BY created_at DESC LIMIT 1`,
      )
      .get<{ id: string }>(input.buildId);
    const revision = await db
      .prepare(
        `SELECT r.*, a.sha256 AS artifact_sha256, th.sha256 AS thumbnail_sha256
           FROM showcase.revisions r
           JOIN showcase.assets a ON a.id = r.artifact_asset_id
           LEFT JOIN showcase.assets th ON th.id = r.thumbnail_asset_id
          WHERE r.id = ? AND r.build_id = ?`,
      )
      .get<{
        id: string;
        artifact_asset_id: string;
        artifact_sha256: string;
        thumbnail_sha256: string | null;
      }>(build.published_revision_id ?? latest?.id ?? "", input.buildId);

    if (!revision) {
      return { ok: false, code: "not_found", reason: "Revision not found." };
    }
    if (latest?.id !== revision.id) {
      return {
        ok: false,
        code: "stale",
        reason: "A newer revision exists; review the latest record.",
      };
    }

    const rights = await currentShowcaseRights(db, build.source_id);

    if (!rights || rights.state !== "approved") {
      return {
        ok: false,
        code: "rights",
        reason: "The source has no approved rights decision.",
      };
    }
    if (
      !rights.displayAllowed ||
      !rights.cacheAllowed ||
      !rights.redistributeAllowed
    ) {
      return {
        ok: false,
        code: "rights",
        reason:
          "The approved decision does not allow display, cache and redistribution.",
      };
    }

    const binding = await getShowcaseBinding(db, revision.id);
    const model = binding?.modelId
      ? await loadCatalogModel(db, binding.modelId)
      : null;

    if (!binding || !model) {
      return {
        ok: false,
        code: "binding",
        reason: "The revision has no accepted model binding.",
      };
    }

    const validity = bindingStillValid(
      binding,
      model,
      catalogIdentityDigest(model),
    );

    if (!validity.ok) {
      return {
        ok: false,
        code: "binding",
        reason: validity.reason,
      };
    }

    const asset = await readShowcaseAsset(db, revision.artifact_asset_id);

    if (!asset) {
      return {
        ok: false,
        code: "invalid",
        reason: "The artifact bytes are missing.",
      };
    }

    let packaged: { html: string; sha256: string };

    try {
      packaged = packageVisualArtifact(asset.mime, asset.bytes);
    } catch (error) {
      return {
        ok: false,
        code: "invalid",
        reason:
          error instanceof Error ? error.message : "The artifact is invalid.",
      };
    }

    const rightsHash = sha256Hex(
      `${rights.id}\0${rights.evidenceSha256}\0${rights.licenseSha256}`,
    );
    const bindingHash = sha256Hex(
      `${model.id}\0${binding.catalogDigest}\0${binding.method}`,
    );
    const now = new Date().toISOString();

    await db
      .prepare(
        `UPDATE showcase.builds
            SET visibility = 'published', published_revision_id = ?,
                published_at = ?, withdrawal_note = NULL, updated_at = ?
          WHERE id = ?`,
      )
      .run(revision.id, now, now, input.buildId);
    await db
      .prepare(
        `INSERT INTO showcase.reviews
          (id, revision_id, decision, rights_sha256, bundle_sha256,
           binding_sha256, reviewer, note, created_at)
         VALUES (?, ?, 'publish', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `rev_${randomUUID()}`,
        revision.id,
        rightsHash,
        packaged.sha256,
        bindingHash,
        input.reviewer,
        input.note.trim(),
        now,
      );

    return {
      ok: true,
      code: "published",
      reason: `Published ${revision.id}.`,
    };
  })();
}

export async function withdrawShowcaseBuild(
  db: PostgresDatabase,
  input: { buildId: string; reviewer: string; note: string },
): Promise<boolean> {
  const now = new Date().toISOString();
  const build = await db
    .prepare(`SELECT published_revision_id FROM showcase.builds WHERE id = ?`)
    .get<{ published_revision_id: string | null }>(input.buildId);

  if (!build) return false;

  const result = await db
    .prepare(
      `UPDATE showcase.builds
          SET visibility = 'withdrawn', withdrawal_note = ?, updated_at = ?
        WHERE id = ?`,
    )
    .run(input.note.trim() || "Withdrawn by operator.", now, input.buildId);

  if (result.changes === 1 && build.published_revision_id) {
    await db
      .prepare(
        `INSERT INTO showcase.reviews
          (id, revision_id, decision, rights_sha256, bundle_sha256,
           binding_sha256, reviewer, note, created_at)
         VALUES (?, ?, 'withdraw', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `rev_${randomUUID()}`,
        build.published_revision_id,
        sha256Hex(`withdraw:${input.buildId}`),
        sha256Hex(`withdraw:${input.buildId}`),
        sha256Hex(`withdraw:${input.buildId}`),
        input.reviewer.trim() || "operator",
        input.note.trim(),
        now,
      );
  }

  return result.changes === 1;
}
