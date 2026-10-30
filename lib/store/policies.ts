import "server-only";

import { randomUUID } from "node:crypto";

import { db, nowIso } from "../db";

export type PolicyAcceptanceSource = "signup" | "account";

export type PolicyAcceptance = {
  id: string;
  userId: string;
  version: string;
  source: PolicyAcceptanceSource;
  acceptedAt: string;
};

type Row = {
  id: string;
  user_id: string;
  version: string;
  source: string;
  accepted_at: string;
};

const SELECT = "id, user_id, version, source, accepted_at";

function toAcceptance(row: Row): PolicyAcceptance {
  return {
    id: row.id,
    userId: row.user_id,
    version: row.version,
    source: row.source as PolicyAcceptanceSource,
    acceptedAt: row.accepted_at,
  };
}

export function getPolicyAcceptance(userId: string, version: string) {
  const row = db
    .prepare(
      `SELECT ${SELECT}
       FROM policy_acceptances
       WHERE user_id = ? AND version = ?`,
    )
    .get(userId, version) as Row | undefined;

  return row ? toAcceptance(row) : null;
}

export function hasAcceptedPolicy(userId: string, version: string) {
  return getPolicyAcceptance(userId, version) !== null;
}

/** Idempotent: the unique (user_id, version) constraint keeps the first
 * acceptance timestamp instead of overwriting it on a repeat submit. */
export function recordPolicyAcceptance(input: {
  userId: string;
  version: string;
  source: PolicyAcceptanceSource;
}) {
  db.prepare(
    `INSERT INTO policy_acceptances
      (id, user_id, version, source, accepted_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, version) DO NOTHING`,
  ).run(
    `policy_${randomUUID()}`,
    input.userId,
    input.version,
    input.source,
    nowIso(),
  );

  return getPolicyAcceptance(input.userId, input.version)!;
}
