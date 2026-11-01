import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type { IdentityArm, IdentitySampleRecord } from "../types.ts";

import { toSample, type SampleRow } from "./rows.ts";

export async function insertSample(
  db: PostgresDatabase,
  sample: IdentitySampleRecord,
) {
  await db
    .prepare(
      `INSERT INTO identity.samples
        (id, run_id, probe_id, arm, iteration, http_status, model_field,
         prompt_tokens, completion_tokens, response_sha256, response_excerpt,
         top_logprobs_json, latency_ms, error_class, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
    )
    .run(
      sample.id,
      sample.runId,
      sample.probeId,
      sample.arm,
      sample.iteration,
      sample.httpStatus,
      sample.modelField,
      sample.promptTokens,
      sample.completionTokens,
      sample.responseSha256,
      sample.responseExcerpt,
      sample.topLogprobsJson,
      sample.latencyMs,
      sample.errorClass,
      sample.createdAt,
    );
}

export async function listSamples(
  db: PostgresDatabase,
  runId: string,
  arm?: IdentityArm,
): Promise<IdentitySampleRecord[]> {
  const rows = arm
    ? await db
        .prepare(
          `SELECT * FROM identity.samples
            WHERE run_id = ? AND arm = ?
            ORDER BY probe_id, iteration`,
        )
        .all<SampleRow>(runId, arm)
    : await db
        .prepare(
          `SELECT * FROM identity.samples
            WHERE run_id = ?
            ORDER BY arm, probe_id, iteration`,
        )
        .all<SampleRow>(runId);

  return rows.map(toSample);
}

export async function countSamples(db: PostgresDatabase, runId: string) {
  const rows = await db
    .prepare(
      `SELECT arm, COUNT(*)::int AS total
         FROM identity.samples WHERE run_id = ? GROUP BY arm`,
    )
    .all<{ arm: IdentityArm; total: number }>(runId);
  const counts = { target: 0, diffControl: 0 };

  for (const row of rows) {
    if (row.arm === "target") counts.target = Number(row.total);
    if (row.arm === "diff_control") counts.diffControl = Number(row.total);
  }

  return counts;
}

export async function deleteExpiredSamples(
  db: PostgresDatabase,
  now: string,
  retentionDays: number,
) {
  const cutoff = new Date(
    Math.max(0, Date.parse(now) - retentionDays * 86_400_000),
  ).toISOString();
  const result = await db
    .prepare("DELETE FROM identity.samples WHERE created_at < ?")
    .run(cutoff);

  return result.changes;
}
