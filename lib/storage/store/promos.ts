import type { PostgresDatabase } from "../pg-adapter.ts";
import type { PromoCodeSummary, PromoStatus } from "../../promo-codes.ts";

import { randomUUID } from "node:crypto";

import { insertActivity } from "../ledger/activity.ts";
import {
  generatePromoCode,
  normalizePromoCode,
  promoAmountProblem,
  promoCodeHash,
  promoCodePrefix,
  promoRedemptionProblem,
  promoWindowProblem,
} from "../../promo-codes.ts";

import { isUniqueViolation } from "./promo-shared.ts";

/**
 * Promo code administration, ported to the async handle (FID-086, Batch B).
 *
 * The rules are imported from `lib/promo-codes.ts` rather than restated: the
 * alphabet, the code hash, the amount ceiling, the redemption ceiling and the
 * window check all live there, so the console and the customer route cannot
 * disagree about what a valid code is.
 *
 * Two properties are worth stating because they are the reason this is a store
 * and not a form handler:
 *
 * 1. **The plaintext code is never stored.** Only its hash and a nine-character
 *    prefix are, which is enough to show an operator which code they made
 *    without keeping a redeemable secret in the database.
 * 2. **A requested code that already exists is reported, not retried.** An
 *    auto-generated code retries (a collision there is luck), but a code the
 *    operator typed must not silently become a different one.
 *
 * Redemption lives in `promo-redemption.ts`; it is re-exported here so callers
 * keep a single import path.
 */

export { redeemPromoCode } from "./promo-redemption.ts";
export type { RedeemPromoResult } from "./promo-redemption.ts";

type PromoRow = {
  id: string;
  code_prefix: string;
  label: string;
  amount_micros: number | string;
  max_redemptions: number | string;
  redeemed_count: number | string;
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

/** `BIGINT` arrives as a string from the driver; summaries carry numbers. */
function toSummary(row: PromoRow): PromoCodeSummary {
  return {
    id: row.id,
    codePrefix: row.code_prefix,
    label: row.label,
    amountMicros: Number(row.amount_micros),
    maxRedemptions: Number(row.max_redemptions),
    redeemedCount: Number(row.redeemed_count),
    status: row.status as PromoStatus,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

async function insertPromo(
  db: PostgresDatabase,
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

  await db
    .transaction(async () => {
      await db
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

      await insertActivity(db, {
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

export async function createPromoCode(
  db: PostgresDatabase,
  input: {
    amountMicros: number;
    maxRedemptions: number;
    label?: string;
    code?: string;
    startsAt?: string | null;
    expiresAt?: string | null;
    now?: string;
  },
): Promise<CreatePromoResult> {
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
      const created = await insertPromo(db, {
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
      if (!isUniqueViolation(error)) throw error;
      if (requested) return { ok: false, error: "code_exists" };
    }
  }

  return { ok: false, error: "generation_failed" };
}

export async function listPromoCodes(
  db: PostgresDatabase,
  limit = 100,
): Promise<PromoCodeSummary[]> {
  const rows = await db
    .prepare(
      `SELECT id, code_prefix, label, amount_micros, max_redemptions,
              redeemed_count, status, starts_at, expires_at, created_at
         FROM promo_codes
        ORDER BY created_at::timestamptz DESC
        LIMIT ?`,
    )
    .all(Math.min(200, Math.max(1, Math.trunc(limit))));

  return (rows as PromoRow[]).map(toSummary);
}

export async function setPromoCodeStatus(
  db: PostgresDatabase,
  id: string,
  status: PromoStatus,
) {
  const existing = (await db
    .prepare("SELECT status FROM promo_codes WHERE id = ?")
    .get(id)) as { status: string } | undefined;

  if (!existing) return "missing" as const;
  if (existing.status === status) return "unchanged" as const;

  await db
    .prepare("UPDATE promo_codes SET status = ? WHERE id = ?")
    .run(status, id);

  return "updated" as const;
}
