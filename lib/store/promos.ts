import "server-only";

import type { CreatePromoResult, RedeemPromoResult } from "../promo-ledger";
import type { PromoStatus } from "../promo-codes";

import {
  createPromoCode as createPromoCodeInDb,
  listPromoCodes as listPromoCodesInDb,
  redeemPromoCode as redeemPromoCodeInDb,
  setPromoCodeStatus as setPromoCodeStatusInDb,
} from "../promo-ledger";
import { db } from "../db";

export type { CreatePromoResult, RedeemPromoResult };

export function createPromoCode(input: {
  amountMicros: number;
  maxRedemptions: number;
  label?: string;
  code?: string;
  startsAt?: string | null;
  expiresAt?: string | null;
  now?: string;
}): CreatePromoResult {
  return createPromoCodeInDb(db, input);
}

export function listPromoCodes(limit = 100) {
  return listPromoCodesInDb(db, limit);
}

export function setPromoCodeStatus(id: string, status: PromoStatus) {
  return setPromoCodeStatusInDb(db, id, status);
}

export function redeemPromoCode(input: {
  userId: string;
  code: string;
  now?: string;
  enabled?: boolean;
}): RedeemPromoResult {
  return redeemPromoCodeInDb(db, input);
}
