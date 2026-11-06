import type { PostgresDatabase } from "../pg-adapter.ts";
import type { VisualBuildAsset } from "../../visual-builds/types.ts";

import { randomUUID } from "node:crypto";

/**
 * Content-addressed showcase assets. The source row is locked for the quota
 * check and insert, so two concurrent imports cannot both spend the same
 * remaining bytes.
 */

export type PutAssetInput = {
  sha256: string;
  mime: string;
  kind: "artifact" | "thumbnail";
  bytes: Uint8Array;
};

export class ShowcaseAssetError extends Error {}

export async function putShowcaseAsset(
  db: PostgresDatabase,
  sourceId: string,
  input: PutAssetInput,
): Promise<VisualBuildAsset> {
  if (input.bytes.byteLength === 0) {
    throw new ShowcaseAssetError("A showcase asset cannot be empty.");
  }

  return db.transaction(async () => {
    const source = await db
      .prepare(
        `SELECT id, max_storage_bytes FROM showcase.sources
          WHERE id = ? FOR UPDATE`,
      )
      .get<{ id: string; max_storage_bytes: number | string }>(sourceId);

    if (!source) {
      throw new ShowcaseAssetError("The showcase source does not exist.");
    }

    const existing = await db
      .prepare(`SELECT * FROM showcase.assets WHERE sha256 = ?`)
      .get<{
        id: string;
        sha256: string;
        mime: string;
        kind: "artifact" | "thumbnail";
        byte_size: number;
        created_at: string;
      }>(input.sha256);

    if (existing) {
      if (existing.mime !== input.mime || existing.kind !== input.kind) {
        throw new ShowcaseAssetError(
          "An existing showcase asset has a different media type.",
        );
      }

      return {
        id: existing.id,
        sha256: existing.sha256,
        mime: existing.mime,
        kind: existing.kind,
        byteSize: Number(existing.byte_size),
        createdAt: existing.created_at,
      };
    }

    const usage = await db
      .prepare(
        `SELECT COALESCE(SUM(byte_size), 0) AS total
           FROM showcase.assets WHERE source_id = ?`,
      )
      .get<{ total: number | string }>(sourceId);
    const total = Number(usage?.total ?? 0);

    if (total + input.bytes.byteLength > Number(source.max_storage_bytes)) {
      throw new ShowcaseAssetError(
        "The showcase source storage quota is full.",
      );
    }

    const id = `ast_${randomUUID()}`;
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO showcase.assets
          (id, source_id, sha256, mime, kind, bytes, byte_size, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        sourceId,
        input.sha256,
        input.mime,
        input.kind,
        Buffer.from(input.bytes),
        input.bytes.byteLength,
        now,
      );

    return {
      id,
      sha256: input.sha256,
      mime: input.mime,
      kind: input.kind,
      byteSize: input.bytes.byteLength,
      createdAt: now,
    };
  })();
}

export async function readShowcaseAsset(
  db: PostgresDatabase,
  assetId: string,
): Promise<{
  id: string;
  sha256: string;
  mime: string;
  kind: "artifact" | "thumbnail";
  bytes: Uint8Array;
} | null> {
  const row = await db
    .prepare(
      `SELECT id, sha256, mime, kind, bytes FROM showcase.assets WHERE id = ?`,
    )
    .get<{
      id: string;
      sha256: string;
      mime: string;
      kind: "artifact" | "thumbnail";
      bytes: Uint8Array;
    }>(assetId);

  return row ? { ...row, bytes: new Uint8Array(row.bytes) } : null;
}

export async function showcaseStorageUsage(
  db: PostgresDatabase,
  sourceId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(byte_size), 0) AS total
         FROM showcase.assets WHERE source_id = ?`,
    )
    .get<{ total: number | string }>(sourceId);

  return Number(row?.total ?? 0);
}
