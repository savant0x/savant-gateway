/**
 * Durable content automation state (FID-2026-1104-015).
 *
 * Policy lives in the existing settings authority. Runs are first-class rows,
 * not log lines, so a heartbeat can answer what was admitted, what completed and
 * what was interrupted. A run owns a renewable lease; an expired lease is
 * repaired on the next tick instead of looking healthy forever.
 */

import type { PostgresDatabase } from "../../storage/pg-adapter.ts";
import type { ContentAutomationPolicy, ParsedPolicy } from "../automation.ts";
import type { FetchRun, FetchRunStatus, FetchRunTrigger } from "../types.ts";

import { randomUUID } from "node:crypto";

import {
  AUTOMATION_SETTINGS_KEY,
  defaultAutomationPolicy,
  parseAutomationPolicy,
  validateAutomationPatch,
} from "../automation.ts";
import { clampPageLimit, decodeCursor, encodeCursor } from "../pagination.ts";
import { getSetting, saveSetting } from "../../storage/store/settings.ts";

import { countDueSources } from "./source-due.ts";

export type PolicyRead = {
  policy: ContentAutomationPolicy;
  error: string | null;
};

export type PolicySave =
  | { ok: true; policy: ContentAutomationPolicy }
  | { ok: false; status: 400 | 409; error: string };

export type RunStart = {
  trigger: FetchRunTrigger;
  ownerToken: string;
  batchLimit: number;
  leaseMs: number;
  sourcesDue: number;
};

export type RunFinish = {
  status: Exclude<FetchRunStatus, "running">;
  sourcesClaimed: number;
  sourcesOk: number;
  sourcesFailed: number;
  sourcesSkipped: number;
  deadlineReached: boolean;
  error: string | null;
};

type RunRow = {
  id: string;
  trigger: FetchRun["trigger"];
  status: FetchRunStatus;
  started_at: string;
  finished_at: string | null;
  expires_at: string;
  owner_token: string;
  batch_limit: number;
  sources_due: number;
  sources_claimed: number;
  sources_ok: number;
  sources_failed: number;
  sources_skipped: number;
  deadline_reached: number;
  error: string | null;
};

function rowToRun(row: RunRow): FetchRun {
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    expiresAt: row.expires_at,
    ownerToken: row.owner_token,
    batchLimit: row.batch_limit,
    sourcesDue: row.sources_due,
    sourcesClaimed: row.sources_claimed,
    sourcesOk: row.sources_ok,
    sourcesFailed: row.sources_failed,
    sourcesSkipped: row.sources_skipped,
    deadlineReached: row.deadline_reached === 1,
    error: row.error,
  };
}

export async function readAutomationPolicy(
  db: PostgresDatabase,
  env: Record<string, string | undefined> = process.env,
): Promise<PolicyRead> {
  const raw = await getSetting(db, AUTOMATION_SETTINGS_KEY);
  const parsed: ParsedPolicy = parseAutomationPolicy(raw, env);

  if (parsed.ok) return { policy: parsed.policy, error: null };

  // A corrupt row must not silently enable automatic work.
  return {
    policy: { ...defaultAutomationPolicy(env), enabled: false },
    error: parsed.error,
  };
}

/**
 * Serialized PATCH. The settings row is locked so two operators cannot both
 * successfully save the same expected revision.
 */
export async function saveAutomationPolicy(
  db: PostgresDatabase,
  input: Record<string, unknown>,
  env: Record<string, string | undefined> = process.env,
): Promise<PolicySave> {
  return db.transaction<PolicySave>(async () => {
    const fallback = JSON.stringify(defaultAutomationPolicy(env));

    await db.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (key) DO NOTHING`,
      [AUTOMATION_SETTINGS_KEY, fallback, new Date().toISOString()],
    );

    const stored = await db.query<{ value: string }>(
      `SELECT value FROM settings WHERE key = ? FOR UPDATE`,
      [AUTOMATION_SETTINGS_KEY],
    );
    const parsed = parseAutomationPolicy(stored[0]?.value ?? null, env);

    if (!parsed.ok) {
      return { ok: false, status: 400, error: parsed.error };
    }

    const validated = validateAutomationPatch(parsed.policy, input);

    if (!validated.ok) {
      const conflict = validated.error.includes("changed since");

      return {
        ok: false,
        status: conflict ? 409 : 400,
        error: validated.error,
      };
    }

    const next: ContentAutomationPolicy = {
      ...validated.policy,
      revision: parsed.policy.revision + 1,
    };

    await saveSetting(db, AUTOMATION_SETTINGS_KEY, JSON.stringify(next));

    return { ok: true, policy: next };
  })();
}

export async function startFetchRun(
  db: PostgresDatabase,
  input: RunStart,
  now = new Date(),
): Promise<FetchRun> {
  const id = randomUUID();
  const startedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + input.leaseMs).toISOString();
  const result = await db.query<RunRow>(
    `INSERT INTO content.fetch_runs (
       id, trigger, status, started_at, expires_at, owner_token, batch_limit,
       sources_due
     ) VALUES (?, ?, 'running', ?, ?, ?, ?, ?)
     RETURNING *`,
    [
      id,
      input.trigger,
      startedAt,
      expiresAt,
      input.ownerToken,
      input.batchLimit,
      input.sourcesDue,
    ],
  );

  return rowToRun(result[0]);
}

export async function touchFetchRun(
  db: PostgresDatabase,
  runId: string,
  ownerToken: string,
  leaseMs: number,
  now = new Date(),
): Promise<boolean> {
  const result = await db.query<{ id: string }>(
    `UPDATE content.fetch_runs
        SET expires_at = ?
      WHERE id = ? AND owner_token = ? AND status = 'running'
      RETURNING id`,
    [new Date(now.getTime() + leaseMs).toISOString(), runId, ownerToken],
  );

  return result.length === 1;
}

export async function finishFetchRun(
  db: PostgresDatabase,
  runId: string,
  input: RunFinish,
  now = new Date(),
): Promise<FetchRun | null> {
  const result = await db.query<RunRow>(
    `UPDATE content.fetch_runs
        SET status = ?, finished_at = ?, sources_claimed = ?, sources_ok = ?,
            sources_failed = ?, sources_skipped = ?, deadline_reached = ?,
            error = ?
      WHERE id = ? AND status = 'running'
      RETURNING *`,
    [
      input.status,
      now.toISOString(),
      input.sourcesClaimed,
      input.sourcesOk,
      input.sourcesFailed,
      input.sourcesSkipped,
      input.deadlineReached ? 1 : 0,
      input.error,
      runId,
    ],
  );

  return result[0] ? rowToRun(result[0]) : null;
}

/**
 * Repairs work whose owner lease expired. The run and every linked running cycle
 * become `interrupted`; expired claims are removed so a later tick can reclaim
 * them. A paused cycle is resumable and is intentionally not touched here.
 */
export async function recoverInterruptedRuns(
  db: PostgresDatabase,
  now = new Date(),
): Promise<number> {
  const at = now.toISOString();
  const cycles = await db.query<{ id: string }>(
    `UPDATE content.fetch_cycles c
        SET status = 'interrupted', finished_at = ?, budget_stopped = 1
       FROM content.fetch_runs r
      WHERE c.run_id = r.id
        AND c.status = 'running'
        AND r.status = 'running'
        AND r.expires_at::timestamptz <= ?::timestamptz
      RETURNING c.id`,
    [at, at],
  );
  const legacy = await db.query<{ id: string }>(
    `UPDATE content.fetch_cycles
        SET status = 'interrupted', finished_at = ?, budget_stopped = 1
      WHERE status = 'running'
        AND run_id IS NULL
        AND started_at::timestamptz <= ?::timestamptz - INTERVAL '15 minutes'
      RETURNING id`,
    [at, at],
  );
  const runs = await db.query<{ id: string }>(
    `UPDATE content.fetch_runs
        SET status = 'interrupted', finished_at = ?,
            error = 'The owner lease expired before the run completed.'
      WHERE status = 'running' AND expires_at::timestamptz <= ?::timestamptz
      RETURNING id`,
    [at, at],
  );
  const claims = await db.query<{ source_id: string }>(
    `DELETE FROM content.ingest_claims
      WHERE expires_at::timestamptz <= ?::timestamptz
      RETURNING source_id`,
    [at],
  );

  return cycles.length + legacy.length + runs.length + claims.length;
}

export async function getFetchRun(
  db: PostgresDatabase,
  id: string,
): Promise<FetchRun | null> {
  const result = await db.query<RunRow>(
    `SELECT * FROM content.fetch_runs WHERE id = ?`,
    [id],
  );

  return result[0] ? rowToRun(result[0]) : null;
}

export async function latestFetchRun(
  db: PostgresDatabase,
): Promise<FetchRun | null> {
  const result = await db.query<RunRow>(
    `SELECT * FROM content.fetch_runs
      ORDER BY started_at DESC, id DESC
      LIMIT 1`,
  );

  return result[0] ? rowToRun(result[0]) : null;
}

export async function listFetchRuns(
  db: PostgresDatabase,
  options: { limit?: string | null; cursor?: string | null } = {},
): Promise<{ runs: FetchRun[]; nextCursor: string | null }> {
  const limit = clampPageLimit(options.limit, 25, 100);
  const cursor = decodeCursor(options.cursor, 2);
  const params: string[] = [];
  let where = "";

  if (cursor) {
    where = `WHERE (started_at, id) < (?, ?)`;
    params.push(cursor[0], cursor[1]);
  }

  const result = await db.query<RunRow>(
    `SELECT * FROM content.fetch_runs
     ${where}
     ORDER BY started_at DESC, id DESC
     LIMIT ${limit + 1}`,
    params,
  );
  const rows = result.slice(0, limit);
  const next =
    result.length > limit && rows.length > 0
      ? encodeCursor([
          rows[rows.length - 1].started_at,
          rows[rows.length - 1].id,
        ])
      : null;

  return { runs: rows.map(rowToRun), nextCursor: next };
}

export type AutomationSnapshot = {
  policy: ContentAutomationPolicy;
  policyError: string | null;
  lastRun: FetchRun | null;
  dueCount: number;
  lastSuccessAt: string | null;
};

export async function automationSnapshot(
  db: PostgresDatabase,
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
): Promise<AutomationSnapshot> {
  const read = await readAutomationPolicy(db, env);
  const [lastRun, dueCount, success] = await Promise.all([
    latestFetchRun(db),
    countDueSources(db, now.toISOString()),
    db.query<{ last_success: string | null }>(
      `SELECT MAX(last_success_at) AS last_success FROM content.sources`,
    ),
  ]);

  return {
    policy: read.policy,
    policyError: read.error,
    lastRun,
    dueCount,
    lastSuccessAt: success[0]?.last_success ?? null,
  };
}
