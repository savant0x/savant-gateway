import type { PostgresDatabase } from "../pg-adapter.ts";

import { randomUUID } from "node:crypto";

/**
 * Policy acceptance store, ported to the async handle (FID-085 step 4).
 *
 * Acceptance is evidence, not state: the first timestamp is the one that counts,
 * because it is when the customer agreed to the version they were shown. The
 * `ON CONFLICT (user_id, version) DO NOTHING` upsert keeps that property, and it
 * is one of the statements whose spelling survives the dialect change unchanged.
 */

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

export async function getPolicyAcceptance(
  db: PostgresDatabase,
  userId: string,
  version: string,
) {
  const row = await db
    .prepare(
      `SELECT ${SELECT}
         FROM policy_acceptances
        WHERE user_id = ? AND version = ?`,
    )
    .get<Row>(userId, version);

  return row ? toAcceptance(row) : null;
}

export async function hasAcceptedPolicy(
  db: PostgresDatabase,
  userId: string,
  version: string,
) {
  return (await getPolicyAcceptance(db, userId, version)) !== null;
}

/** Idempotent: the unique (user_id, version) constraint keeps the first
 * acceptance timestamp instead of overwriting it on a repeat submit. */
export async function recordPolicyAcceptance(
  db: PostgresDatabase,
  input: {
    userId: string;
    version: string;
    source: PolicyAcceptanceSource;
    now?: string;
  },
) {
  await db
    .prepare(
      `INSERT INTO policy_acceptances
        (id, user_id, version, source, accepted_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, version) DO NOTHING`,
    )
    .run(
      `policy_${randomUUID()}`,
      input.userId,
      input.version,
      input.source,
      input.now ?? new Date().toISOString(),
    );

  return (await getPolicyAcceptance(db, input.userId, input.version))!;
}
