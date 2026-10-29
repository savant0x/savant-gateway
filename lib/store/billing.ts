import "server-only";

import type { AccountSummary, CreditLedgerEntry } from "../types";

import { randomUUID } from "node:crypto";

import { db, nowIso } from "../db";

export const DEFAULT_TENANT = "user_dev";
export const HOLD_TTL_MS = 15 * 60 * 1000;

type BalanceRow = {
  credit_micros: number;
  held_micros: number;
};

export type CreditHold = {
  id: string;
  holdMicros: number;
};

function balanceRow(userId: string): BalanceRow | undefined {
  return db
    .prepare("SELECT credit_micros, held_micros FROM users WHERE id = ?")
    .get(userId) as BalanceRow | undefined;
}

export function getAccountSummary(userId = DEFAULT_TENANT): AccountSummary {
  releaseExpiredHolds(userId);

  const row = balanceRow(userId);
  const creditMicros = row?.credit_micros ?? 0;
  const heldMicros = Math.max(0, row?.held_micros ?? 0);

  return {
    creditMicros,
    heldMicros,
    availableMicros: Math.max(0, creditMicros - heldMicros),
  };
}

export function listCreditLedger(
  limit = 20,
  userId = DEFAULT_TENANT,
): CreditLedgerEntry[] {
  const rows = db
    .prepare(
      `SELECT id, kind, amount_micros, balance_after_micros, note, created_at
       FROM credit_ledger
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC
       LIMIT ?`,
    )
    .all(userId, limit) as Array<{
    id: string;
    kind: string;
    amount_micros: number;
    balance_after_micros: number;
    note: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    amountMicros: row.amount_micros,
    balanceAfterMicros: row.balance_after_micros,
    note: row.note,
    createdAt: row.created_at,
  }));
}

export function grantCredit(input: {
  amountMicros: number;
  note?: string | null;
  userId?: string;
  kind?: string;
}) {
  const userId = input.userId ?? DEFAULT_TENANT;
  const amount = Math.round(input.amountMicros);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Credit grants must be a positive amount.");
  }

  db.transaction(() => {
    const before = balanceRow(userId);

    if (!before) throw new Error("Tenant not found.");

    const balanceAfter = before.credit_micros + amount;

    db.prepare("UPDATE users SET credit_micros = ? WHERE id = ?").run(
      balanceAfter,
      userId,
    );

    db.prepare(
      `INSERT INTO credit_ledger
        (id, user_id, kind, amount_micros, balance_after_micros, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `ledger_${randomUUID()}`,
      userId,
      input.kind ?? "grant",
      amount,
      balanceAfter,
      input.note?.slice(0, 300) ?? null,
      nowIso(),
    );
  }).immediate();

  return getAccountSummary(userId);
}

/** Releases holds whose reservation window elapsed without settlement. */
export function releaseExpiredHolds(userId = DEFAULT_TENANT, now = Date.now()) {
  const cutoff = new Date(now).toISOString();
  const expired = db
    .prepare(
      `SELECT id, hold_micros FROM credit_holds
       WHERE user_id = ? AND expires_at <= ?`,
    )
    .all(userId, cutoff) as Array<{ id: string; hold_micros: number }>;

  if (expired.length === 0) return 0;

  const total = expired.reduce((sum, row) => sum + row.hold_micros, 0);

  db.transaction(() => {
    db.prepare(
      "DELETE FROM credit_holds WHERE user_id = ? AND expires_at <= ?",
    ).run(userId, cutoff);
    db.prepare(
      `UPDATE users
       SET held_micros = MAX(0, held_micros - ?)
       WHERE id = ?`,
    ).run(total, userId);
  }).immediate();

  return total;
}

/**
 * Atomically checks available credit and records a hold. Returns null when the
 * balance cannot cover the reservation.
 */
export function reserveCreditHold(input: {
  userId?: string;
  keyId: string;
  modelId: string;
  holdMicros: number;
  ttlMs?: number;
}): CreditHold | null {
  const userId = input.userId ?? DEFAULT_TENANT;
  const holdMicros = Math.max(1, Math.round(input.holdMicros));
  const ttlMs = input.ttlMs ?? HOLD_TTL_MS;
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ttlMs).toISOString();
  const id = `hold_${randomUUID()}`;

  releaseExpiredHolds(userId, now);

  const reserved = db
    .transaction(() => {
      const row = balanceRow(userId);

      if (!row) return false;
      if (row.credit_micros - row.held_micros < holdMicros) return false;

      db.prepare(
        "UPDATE users SET held_micros = held_micros + ? WHERE id = ?",
      ).run(holdMicros, userId);

      db.prepare(
        `INSERT INTO credit_holds
        (id, user_id, api_key_id, model_id, hold_micros, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        userId,
        input.keyId,
        input.modelId,
        holdMicros,
        createdAt,
        expiresAt,
      );

      return true;
    })
    .immediate();

  return reserved ? { id, holdMicros } : null;
}

export function releaseCreditHold(holdId: string, userId = DEFAULT_TENANT) {
  db.transaction(() => {
    const row = db
      .prepare(
        "SELECT hold_micros FROM credit_holds WHERE id = ? AND user_id = ?",
      )
      .get(holdId, userId) as { hold_micros: number } | undefined;

    if (!row) return;

    db.prepare("DELETE FROM credit_holds WHERE id = ?").run(holdId);
    db.prepare(
      "UPDATE users SET held_micros = MAX(0, held_micros - ?) WHERE id = ?",
    ).run(row.hold_micros, userId);
  }).immediate();
}
