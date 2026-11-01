import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type { IdentityFindingInput, IdentityFindingRecord } from "../types.ts";

import { randomUUID } from "node:crypto";

import { canonicalJson } from "../protocol.ts";

import { toFinding, type FindingRow } from "./rows.ts";

export async function upsertFinding(
  db: PostgresDatabase,
  finding: IdentityFindingInput & { runId: string; now: string },
) {
  await db
    .prepare(
      `INSERT INTO identity.findings
        (id, run_id, class, metric, observed, threshold, n, state,
         evidence_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (run_id, class, metric) DO UPDATE SET
         observed = EXCLUDED.observed,
         threshold = EXCLUDED.threshold,
         n = EXCLUDED.n,
         state = EXCLUDED.state,
         evidence_json = EXCLUDED.evidence_json,
         created_at = EXCLUDED.created_at`,
    )
    .run(
      randomUUID(),
      finding.runId,
      finding.class,
      finding.metric,
      finding.observed === null ? null : String(finding.observed),
      finding.threshold === null ? null : String(finding.threshold),
      finding.n,
      finding.state,
      canonicalJson(finding.evidence),
      finding.now,
    );
}

export async function listFindings(
  db: PostgresDatabase,
  runId: string,
): Promise<IdentityFindingRecord[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM identity.findings
        WHERE run_id = ? ORDER BY class, metric`,
    )
    .all<FindingRow>(runId);

  return rows.map(toFinding);
}
