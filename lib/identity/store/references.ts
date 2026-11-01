import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type {
  IdentityCounts,
  IdentityReferenceInsert,
  IdentityReferenceRecord,
} from "../types.ts";

import { randomUUID } from "node:crypto";

import { FINGERPRINT_SAMPLES } from "../battery.ts";
import { canonicalJson, referenceContentHash } from "../protocol.ts";

import { toReference, type ReferenceRow } from "./rows.ts";

export async function insertReference(
  db: PostgresDatabase,
  input: IdentityReferenceInsert,
): Promise<IdentityReferenceRecord> {
  const id = randomUUID();
  const countsJson = canonicalJson(input.counts);
  const contentSha256 = referenceContentHash({
    canonicalModelKey: input.canonicalModelKey,
    protocolId: input.protocolId,
    providerSlug: input.providerSlug,
    upstreamId: input.upstreamId,
    collectedAt: input.collectedAt,
    nPerCell: FINGERPRINT_SAMPLES,
    counts: input.counts,
  });

  await db
    .prepare(
      `INSERT INTO identity.references
        (id, canonical_model_key, protocol_id, provider_slug, upstream_id,
         collected_at, expires_at, counts_json, n_per_cell, content_sha256,
         run_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.canonicalModelKey,
      input.protocolId,
      input.providerSlug,
      input.upstreamId,
      input.collectedAt,
      input.expiresAt,
      countsJson,
      FINGERPRINT_SAMPLES,
      contentSha256,
      input.runId,
    );

  const reference = await getReference(db, id);

  if (!reference) throw new Error("Identity reference insert failed.");

  return reference;
}

export async function getReference(
  db: PostgresDatabase,
  id: string,
): Promise<IdentityReferenceRecord | null> {
  const row = await db
    .prepare("SELECT * FROM identity.references WHERE id = ?")
    .get<ReferenceRow>(id);

  return row ? toReference(row) : null;
}

export async function selectReference(
  db: PostgresDatabase,
  input: {
    canonicalModelKey: string;
    protocolId: string;
    now: string;
    preferDifferentFrom?: string;
  },
): Promise<IdentityReferenceRecord | null> {
  const rows = await db
    .prepare(
      `SELECT * FROM identity.references
        WHERE canonical_model_key = ? AND protocol_id = ? AND expires_at > ?
        ORDER BY collected_at DESC`,
    )
    .all<ReferenceRow>(input.canonicalModelKey, input.protocolId, input.now);
  const preferred = input.preferDifferentFrom
    ? rows.find((row) => row.provider_slug !== input.preferDifferentFrom)
    : undefined;
  const ordered = preferred
    ? [preferred, ...rows.filter((row) => row !== preferred)]
    : rows;

  for (const row of ordered) {
    let counts: IdentityCounts;

    try {
      counts = JSON.parse(row.counts_json) as IdentityCounts;
    } catch {
      continue;
    }

    if (canonicalJson(counts) !== row.counts_json) continue;

    const expected = referenceContentHash({
      canonicalModelKey: row.canonical_model_key,
      protocolId: row.protocol_id,
      providerSlug: row.provider_slug,
      upstreamId: row.upstream_id,
      collectedAt: row.collected_at,
      nPerCell: Number(row.n_per_cell),
      counts,
    });

    if (expected !== row.content_sha256) continue;

    return toReference(row);
  }

  return null;
}
