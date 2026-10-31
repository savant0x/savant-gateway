import type { PromoCodeSummary, PromoStatus } from "./promo-codes.ts";
import type { DatabaseHandle } from "./schema/columns.ts";

import { randomUUID } from "node:crypto";

import { insertActivity } from "./activity.ts";
import {
  generatePromoCode,
  normalizePromoCode,
  promoAmountProblem,
  promoCodeHash,
  promoCodePrefix,
  promoRedemptionProblem,
  promoWindowProblem,
  readPromoPolicy,
} from "./promo-codes.ts";

type PromoRow = {
  id: string;
  code_prefix: string;
  label: string;
  amount_micros: number;
  max_redemptions: number;
  redeemed_count: number;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type CreatePromoResult =
  | { ok: true; code: string; promo: PromoCodeSummary }
  | {
      ok: false;
      error:
        | "invalid_amount"
        | "invalid_redemptions"
        | "invalid_window"
        | "invalid_code"
        | "code_exists"
        | "generation_failed";
    };

export type RedeemPromoResult =
  | {
      ok: true;
      promoId: string;
      amountMicros: number;
      codePrefix: string;
      balanceAfter: number;
    }
  | {
      ok: false;
      reason:
        | "disabled"
        | "invalid_code"
        | "inactive"
        | "not_started"
        | "expired"
        | "already_redeemed"
        | "exhausted"
        | "unknown_user";
    };

function toSummary(row: PromoRow): PromoCodeSummary {
  return {
    id: row.id,
    codePrefix: row.code_prefix,
    label: row.label,
    amountMicros: row.amount_micros,
    maxRedemptions: row.max_redemptions,
    redeemedCount: row.redeemed_count,
    status: row.status as PromoStatus,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function uniqueConstraint(error: unknown) {
  const code = (error as { code?: string } | null)?.code;

  return typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT");
}

function insertPromo(
  database: DatabaseHandle,
  input: {
    plaintext: string;
    label: string;
    amountMicros: number;
    maxRedemptions: number;
    startsAt: string | null;
    expiresAt: string | null;
    createdAt: string;
  },
) {
  const normalized = normalizePromoCode(input.plaintext);

  if (!normalized) return null;

  const id = `promo_${randomUUID()}`;

  database
    .transaction(() => {
      database
        .prepare(
          `INSERT INTO promo_codes
            (id, code_hash, code_prefix, label, amount_micros, max_redemptions,
             redeemed_count, status, starts_at, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?)`,
        )
        .run(
          id,
          promoCodeHash(normalized),
          promoCodePrefix(normalized),
          input.label,
          input.amountMicros,
          input.maxRedemptions,
          input.startsAt,
          input.expiresAt,
          input.createdAt,
        );

      insertActivity(database, {
        actor: "admin",
        kind: "promo.created",
        entityType: "promo",
        entityId: id,
        metadata: {
          promoId: id,
          amountMicros: input.amountMicros,
          maxRedemptions: input.maxRedemptions,
        },
        now: input.createdAt,
      });
    })
    .immediate();

  return { id, normalized };
}

export function createPromoCode(
  database: DatabaseHandle,
  input: {
    amountMicros: number;
    maxRedemptions: number;
    label?: string;
    code?: string;
    startsAt?: string | null;
    expiresAt?: string | null;
    now?: string;
  },
): CreatePromoResult {
  if (promoAmountProblem(input.amountMicros)) {
    return { ok: false, error: "invalid_amount" };
  }

  if (promoRedemptionProblem(input.maxRedemptions)) {
    return { ok: false, error: "invalid_redemptions" };
  }

  const startsAt = input.startsAt ?? null;
  const expiresAt = input.expiresAt ?? null;

  if (promoWindowProblem(startsAt, expiresAt)) {
    return { ok: false, error: "invalid_window" };
  }

  const requested = input.code?.trim() ? input.code : null;

  if (requested && !normalizePromoCode(requested)) {
    return { ok: false, error: "invalid_code" };
  }

  const createdAt = input.now ?? new Date().toISOString();
  const label = input.label?.trim().slice(0, 80) || "Promo credit";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const plaintext = requested ?? generatePromoCode();

    try {
      const created = insertPromo(database, {
        plaintext,
        label,
        amountMicros: input.amountMicros,
        maxRedemptions: input.maxRedemptions,
        startsAt,
        expiresAt,
        createdAt,
      });

      if (!created) return { ok: false, error: "invalid_code" };

      return {
        ok: true,
        code: created.normalized,
        promo: {
          id: created.id,
          codePrefix: promoCodePrefix(created.normalized),
          label,
          amountMicros: input.amountMicros,
          maxRedemptions: input.maxRedemptions,
          redeemedCount: 0,
          status: "active",
          startsAt,
          expiresAt,
          createdAt,
        },
      };
    } catch (error) {
      if (!uniqueConstraint(error)) throw error;
      if (requested) return { ok: false, error: "code_exists" };
    }
  }

  return { ok: false, error: "generation_failed" };
}

export function listPromoCodes(
  database: DatabaseHandle,
  limit = 100,
): PromoCodeSummary[] {
  const rows = database
    .prepare(
      `SELECT id, code_prefix, label, amount_micros, max_redemptions,
              redeemed_count, status, starts_at, expires_at, created_at
       FROM promo_codes
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(Math.min(200, Math.max(1, Math.trunc(limit)))) as PromoRow[];

  return rows.map(toSummary);
}

export function setPromoCodeStatus(
  database: DatabaseHandle,
  id: string,
  status: PromoStatus,
) {
  const existing = database
    .prepare("SELECT status FROM promo_codes WHERE id = ?")
    .get(id) as { status: string } | undefined;

  if (!existing) return "missing" as const;
  if (existing.status === status) return "unchanged" as const;

  database
    .prepare("UPDATE promo_codes SET status = ? WHERE id = ?")
    .run(status, id);

  return "updated" as const;
}

export function redeemPromoCode(
  database: DatabaseHandle,
  input: {
    userId: string;
    code: string;
    now?: string;
    enabled?: boolean;
  },
): RedeemPromoResult {
  const enabled = input.enabled ?? readPromoPolicy().enabled;

  if (!enabled) return { ok: false, reason: "disabled" };

  const normalized = normalizePromoCode(input.code);

  if (!normalized) return { ok: false, reason: "invalid_code" };

  const hash = promoCodeHash(normalized);
  const now = input.now ?? new Date().toISOString();

  return database
    .transaction((): RedeemPromoResult => {
      const row = database
        .prepare(
          `SELECT id, code_prefix, label, amount_micros, max_redemptions,
                  redeemed_count, status, starts_at, expires_at
           FROM promo_codes WHERE code_hash = ?`,
        )
        .get(hash) as
        | {
            id: string;
            code_prefix: string;
            label: string;
            amount_micros: number;
            max_redemptions: number;
            redeemed_count: number;
            status: string;
            starts_at: string | null;
            expires_at: string | null;
          }
        | undefined;

      if (!row) return { ok: false, reason: "invalid_code" };
      if (row.status !== "active") return { ok: false, reason: "inactive" };
      if (row.starts_at && now < row.starts_at)
        return { ok: false, reason: "not_started" };
      if (row.expires_at && now >= row.expires_at)
        return { ok: false, reason: "expired" };

      const existing = database
        .prepare(
          `SELECT id FROM promo_redemptions
           WHERE promo_code_id = ? AND user_id = ?`,
        )
        .get(row.id, input.userId) as { id: string } | undefined;

      // The unique constraint is the durable guard; this read gives a normal
      // second submission a precise answer instead of a constraint error.
      if (existing) return { ok: false, reason: "already_redeemed" };
      if (row.redeemed_count >= row.max_redemptions)
        return { ok: false, reason: "exhausted" };

      const user = database
        .prepare("SELECT credit_micros FROM users WHERE id = ?")
        .get(input.userId) as { credit_micros: number } | undefined;

      if (!user) return { ok: false, reason: "unknown_user" };

      const claim = database
        .prepare(
          `UPDATE promo_codes
           SET redeemed_count = redeemed_count + 1
           WHERE id = ? AND redeemed_count < max_redemptions`,
        )
        .run(row.id);

      if (claim.changes !== 1) return { ok: false, reason: "exhausted" };

      const redemptionId = `promo_redemption_${randomUUID()}`;
      const ledgerId = `ledger_promo_${randomUUID()}`;
      const balanceAfter = user.credit_micros + row.amount_micros;

      database
        .prepare(
          `INSERT INTO promo_redemptions
            (id, promo_code_id, user_id, amount_micros, ledger_id, redeemed_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          redemptionId,
          row.id,
          input.userId,
          row.amount_micros,
          ledgerId,
          now,
        );

      database
        .prepare("UPDATE users SET credit_micros = ? WHERE id = ?")
        .run(balanceAfter, input.userId);

      database
        .prepare(
          `INSERT INTO credit_ledger
            (id, user_id, kind, amount_micros, balance_after_micros, note,
             created_at, reference)
           VALUES (?, ?, 'promo', ?, ?, ?, ?, ?)`,
        )
        .run(
          ledgerId,
          input.userId,
          row.amount_micros,
          balanceAfter,
          `Promo: ${row.label}`,
          now,
          `promo:${row.id}:${input.userId}`,
        );

      insertActivity(database, {
        userId: input.userId,
        actor: "customer",
        kind: "promo.redeemed",
        entityType: "promo",
        entityId: row.id,
        metadata: {
          promoId: row.id,
          amountMicros: row.amount_micros,
          codePrefix: row.code_prefix,
        },
        now,
      });

      return {
        ok: true,
        promoId: row.id,
        amountMicros: row.amount_micros,
        codePrefix: row.code_prefix,
        balanceAfter,
      };
    })
    .immediate();
}
