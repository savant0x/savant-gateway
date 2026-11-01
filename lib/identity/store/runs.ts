import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type {
  IdentityRunInsert,
  IdentityRunRecord,
  IdentityRunStatus,
} from "../types.ts";

import { randomUUID } from "node:crypto";

import { canonicalJson } from "../protocol.ts";

import { limitValue, toRun, type RunRow } from "./rows.ts";

export async function insertRun(
  db: PostgresDatabase,
  input: IdentityRunInsert,
): Promise<IdentityRunRecord> {
  const id = randomUUID();
  const control = input.control;

  await db
    .prepare(
      `INSERT INTO identity.runs
        (id, target_model_id, target_name, canonical_model_key, provider_slug,
         upstream_id, target_json, provider_json, protocol_id, reference_id,
         control_model_id, control_provider_slug, control_upstream_id,
         control_json, mode, status, cancel_requested, estimate_json,
         created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)`,
    )
    .run(
      id,
      input.target.modelId,
      input.target.name,
      input.target.canonicalKey,
      input.target.providerSlug,
      input.target.upstreamId,
      canonicalJson(input.target),
      canonicalJson(input.provider),
      input.protocolId,
      input.referenceId,
      control?.target.modelId ?? null,
      control?.provider.slug ?? null,
      control?.target.upstreamId ?? null,
      control ? canonicalJson(control) : null,
      input.mode,
      canonicalJson(input.estimate),
      input.now,
    );

  const run = await getRun(db, id);

  if (!run) throw new Error("Identity run insert failed.");

  return run;
}

export async function getRun(
  db: PostgresDatabase,
  id: string,
): Promise<IdentityRunRecord | null> {
  const row = await db
    .prepare("SELECT * FROM identity.runs WHERE id = ?")
    .get<RunRow>(id);

  return row ? toRun(row) : null;
}

export async function listRuns(
  db: PostgresDatabase,
  limit = 50,
): Promise<IdentityRunRecord[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM identity.runs
        ORDER BY created_at DESC LIMIT ?`,
    )
    .all<RunRow>(limitValue(limit, 200));

  return rows.map(toRun);
}

export async function listRunsForTarget(
  db: PostgresDatabase,
  targetModelId: string,
  limit = 10,
): Promise<IdentityRunRecord[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM identity.runs
        WHERE target_model_id = ?
        ORDER BY created_at DESC LIMIT ?`,
    )
    .all<RunRow>(targetModelId, limitValue(limit, 100));

  return rows.map(toRun);
}

/** Atomic queued → running claim; a second caller gets zero rows. */
export async function claimRun(db: PostgresDatabase, id: string, now: string) {
  const rows = await db.query<{ id: string }>(
    `UPDATE identity.runs
        SET status = 'running', started_at = ?
      WHERE id = ? AND status = 'queued'
      RETURNING id`,
    [now, id],
  );

  return rows.length > 0;
}

export async function setRunStatus(
  db: PostgresDatabase,
  id: string,
  status: IdentityRunStatus,
  patch: {
    actualJson?: string | null;
    coverageJson?: string | null;
    errorClass?: string | null;
    errorMessage?: string | null;
    completedAt?: string | null;
  } = {},
) {
  const fields = ["status = ?"];
  const values: unknown[] = [status];

  if (patch.actualJson !== undefined) {
    fields.push("actual_json = ?");
    values.push(patch.actualJson);
  }
  if (patch.coverageJson !== undefined) {
    fields.push("coverage_json = ?");
    values.push(patch.coverageJson);
  }
  if (patch.errorClass !== undefined) {
    fields.push("error_class = ?");
    values.push(patch.errorClass);
  }
  if (patch.errorMessage !== undefined) {
    fields.push("error_message = ?");
    values.push(patch.errorMessage);
  }

  const now = new Date().toISOString();

  if (status === "running") {
    fields.push("started_at = COALESCE(started_at, ?)");
    values.push(now);
  }

  if (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "interrupted"
  ) {
    fields.push("completed_at = ?");
    values.push(patch.completedAt ?? now);
  }

  values.push(id);

  await db
    .prepare(`UPDATE identity.runs SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);
}

export async function requestCancel(db: PostgresDatabase, id: string) {
  const result = await db
    .prepare(
      `UPDATE identity.runs SET cancel_requested = 1
        WHERE id = ? AND status IN ('queued','running')`,
    )
    .run(id);

  return result.changes > 0;
}

export async function isCancelRequested(db: PostgresDatabase, id: string) {
  const row = await db
    .prepare("SELECT cancel_requested FROM identity.runs WHERE id = ?")
    .get<{ cancel_requested: number }>(id);

  return Number(row?.cancel_requested ?? 0) === 1;
}

export async function sweepStaleRuns(
  db: PostgresDatabase,
  now: string,
  olderThanMs = 7_200_000,
) {
  const cutoff = new Date(
    Math.max(0, Date.parse(now) - olderThanMs),
  ).toISOString();
  const result = await db
    .prepare(
      `UPDATE identity.runs
          SET status = 'interrupted', completed_at = ?
        WHERE status = 'running' AND started_at < ?`,
    )
    .run(now, cutoff);

  return result.changes;
}
