import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type {
  IdentityCorrectionRecord,
  IdentityPublished,
  IdentityVerdictRecord,
  IdentityVerdictStatus,
} from "../types.ts";

import { randomUUID } from "node:crypto";

import { canonicalJson } from "../protocol.ts";

import { listFindings } from "./findings.ts";
import {
  limitValue,
  toCorrection,
  toVerdict,
  type CorrectionRow,
  type VerdictRow,
} from "./rows.ts";

export type IdentityVerdictInput = {
  runId: string;
  targetModelId: string;
  status: IdentityVerdictStatus;
  summary: string;
  claims: string[];
  limits: string[];
  coverage: unknown;
  testedAt: string;
  validUntil: string;
  now: string;
};

export async function upsertVerdict(
  db: PostgresDatabase,
  input: IdentityVerdictInput,
): Promise<IdentityVerdictRecord> {
  await db
    .prepare(
      `INSERT INTO identity.verdicts
        (id, run_id, target_model_id, status, summary, claims_json,
         limits_json, coverage_json, tested_at, valid_until, published,
         published_at, published_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?)
       ON CONFLICT (run_id) DO UPDATE SET
         status = EXCLUDED.status,
         summary = EXCLUDED.summary,
         claims_json = EXCLUDED.claims_json,
         limits_json = EXCLUDED.limits_json,
         coverage_json = EXCLUDED.coverage_json,
         tested_at = EXCLUDED.tested_at,
         valid_until = EXCLUDED.valid_until,
         published = 0,
         published_at = NULL,
         published_by = NULL,
         created_at = EXCLUDED.created_at`,
    )
    .run(
      randomUUID(),
      input.runId,
      input.targetModelId,
      input.status,
      input.summary,
      canonicalJson(input.claims),
      canonicalJson(input.limits),
      canonicalJson(input.coverage),
      input.testedAt,
      input.validUntil,
      input.now,
    );

  const verdict = await getVerdict(db, input.runId);

  if (!verdict) throw new Error("Identity verdict insert failed.");

  return verdict;
}

export async function getVerdict(
  db: PostgresDatabase,
  runId: string,
): Promise<IdentityVerdictRecord | null> {
  const row = await db
    .prepare("SELECT * FROM identity.verdicts WHERE run_id = ?")
    .get<VerdictRow>(runId);

  return row ? toVerdict(row) : null;
}

export async function getPublishedVerdict(
  db: PostgresDatabase,
  modelId: string,
): Promise<IdentityPublished | null> {
  const row = await db
    .prepare(
      `SELECT v.*, r.protocol_id AS run_protocol_id
         FROM identity.verdicts v
         JOIN identity.runs r ON r.id = v.run_id
        WHERE v.target_model_id = ? AND v.published = 1
        ORDER BY v.tested_at DESC LIMIT 1`,
    )
    .get<VerdictRow & { run_protocol_id: string }>(modelId);

  if (!row) return null;

  return {
    verdict: toVerdict(row),
    findings: await listFindings(db, row.run_id),
    protocolId: row.run_protocol_id,
  };
}

export type IdentityCorrectionInput = {
  targetModelId: string;
  runId: string | null;
  statusBefore: string | null;
  statusAfter: string | null;
  reason: string;
  evidence: Record<string, unknown>;
  operatorNote: string;
  createdAt?: string;
};

export async function insertCorrection(
  db: PostgresDatabase,
  input: IdentityCorrectionInput,
) {
  await db
    .prepare(
      `INSERT INTO identity.corrections
        (id, target_model_id, run_id, status_before, status_after, reason,
         evidence_json, operator_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      input.targetModelId,
      input.runId,
      input.statusBefore,
      input.statusAfter,
      input.reason,
      canonicalJson(input.evidence),
      input.operatorNote,
      input.createdAt ?? new Date().toISOString(),
    );
}

export async function listCorrections(
  db: PostgresDatabase,
  limit = 20,
): Promise<IdentityCorrectionRecord[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM identity.corrections
        ORDER BY created_at DESC LIMIT ?`,
    )
    .all<CorrectionRow>(limitValue(limit, 100));

  return rows.map(toCorrection);
}

export async function publishVerdict(
  db: PostgresDatabase,
  runId: string,
  now: string,
  note = "Published by operator.",
) {
  return db.transaction(async () => {
    const verdict = await getVerdict(db, runId);

    if (!verdict) return false;

    const result = await db
      .prepare(
        `UPDATE identity.verdicts
            SET published = 1, published_at = ?, published_by = 'operator'
          WHERE run_id = ?`,
      )
      .run(now, runId);

    if (result.changes === 0) return false;

    await insertCorrection(db, {
      targetModelId: verdict.targetModelId,
      runId,
      statusBefore: null,
      statusAfter: verdict.status,
      reason: "published",
      evidence: { runId },
      operatorNote: note,
      createdAt: now,
    });

    return true;
  })();
}

export async function unpublishVerdict(
  db: PostgresDatabase,
  runId: string,
  now: string,
  note: string,
) {
  return db.transaction(async () => {
    const verdict = await getVerdict(db, runId);

    if (!verdict || verdict.published !== 1) return false;

    await db
      .prepare(
        `UPDATE identity.verdicts
            SET published = 0, published_at = NULL, published_by = NULL
          WHERE run_id = ?`,
      )
      .run(runId);

    await insertCorrection(db, {
      targetModelId: verdict.targetModelId,
      runId,
      statusBefore: verdict.status,
      statusAfter: null,
      reason: "unpublished",
      evidence: { runId },
      operatorNote: note,
      createdAt: now,
    });

    return true;
  })();
}

export async function confirmMismatch(
  db: PostgresDatabase,
  runId: string,
  now: string,
  note: string,
) {
  return db.transaction(async () => {
    const verdict = await getVerdict(db, runId);

    if (!verdict || verdict.status !== "divergent_review") return false;

    const result = await db
      .prepare(
        `UPDATE identity.verdicts
            SET status = 'mismatch_confirmed'
          WHERE run_id = ? AND status = 'divergent_review'`,
      )
      .run(runId);

    if (result.changes === 0) return false;

    await insertCorrection(db, {
      targetModelId: verdict.targetModelId,
      runId,
      statusBefore: "divergent_review",
      statusAfter: "mismatch_confirmed",
      reason: "mismatch_confirmed",
      evidence: { runId },
      operatorNote: note,
      createdAt: now,
    });

    return true;
  })();
}
