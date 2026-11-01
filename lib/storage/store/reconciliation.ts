import type { PostgresDatabase } from "../pg-adapter.ts";
import type { AdjustmentKind } from "../ledger/reconciliation.ts";

import { randomUUID } from "node:crypto";

import {
  applyAdjustment,
  reconcileDatabase,
  recordBaseline,
} from "../ledger/reconciliation.ts";

/**
 * Reconciliation store, ported to the async handle (FID-085 step 4).
 *
 * The arithmetic and the guard against minting credit live in
 * `../ledger/reconciliation.ts`. This module is the store-shaped surface the
 * operator console calls: it supplies the identifiers and the clock, so the
 * ledger version stays a pure function of its inputs.
 */

export async function getReconciliation(db: PostgresDatabase) {
  return reconcileDatabase(db);
}

export async function adjustCredit(
  db: PostgresDatabase,
  input: {
    userId: string;
    amountMicros: number;
    kind: AdjustmentKind;
    reference: string;
    note: string;
    now?: string;
  },
) {
  return applyAdjustment(db, {
    ...input,
    now: input.now ?? new Date().toISOString(),
  });
}

export async function saveBaseline(
  db: PostgresDatabase,
  input: {
    userId: string;
    baselineMicros: number;
    note: string;
    now?: string;
  },
) {
  return recordBaseline(db, {
    ...input,
    id: `baseline_${randomUUID()}`,
    now: input.now ?? new Date().toISOString(),
  });
}

export type BalanceBaseline = {
  id: string;
  user_id: string;
  baseline_micros: number;
  note: string | null;
  created_at: string;
};

export async function listBalanceBaselines(
  db: PostgresDatabase,
  limit = 25,
): Promise<BalanceBaseline[]> {
  return db
    .prepare(
      `SELECT id, user_id, baseline_micros, note, created_at
         FROM balance_baselines
        ORDER BY created_at::timestamptz DESC
        LIMIT ?`,
    )
    .all<BalanceBaseline>(limit);
}
