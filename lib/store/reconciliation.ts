import "server-only";

import { randomUUID } from "node:crypto";

import { db, nowIso } from "../db";
import {
  applyAdjustment,
  reconcileDatabase,
  recordBaseline,
  type AdjustmentKind,
} from "../reconciliation";

export function getReconciliation() {
  return reconcileDatabase(db);
}

export function adjustCredit(input: {
  userId: string;
  amountMicros: number;
  kind: AdjustmentKind;
  reference: string;
  note: string;
}) {
  return applyAdjustment(db, { ...input, now: nowIso() });
}

export function saveBaseline(input: {
  userId: string;
  baselineMicros: number;
  note: string;
}) {
  return recordBaseline(db, {
    ...input,
    id: `baseline_${randomUUID()}`,
    now: nowIso(),
  });
}

export type BalanceBaseline = {
  id: string;
  user_id: string;
  baseline_micros: number;
  note: string | null;
  created_at: string;
};

export function listBalanceBaselines(limit = 25): BalanceBaseline[] {
  return db
    .prepare(
      `SELECT id, user_id, baseline_micros, note, created_at
       FROM balance_baselines
       ORDER BY datetime(created_at) DESC
       LIMIT ?`,
    )
    .all(limit) as BalanceBaseline[];
}
