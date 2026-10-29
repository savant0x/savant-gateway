import "server-only";

import type {
  Customer,
  CustomerAccount,
  KeySummary,
  UsageSummary,
} from "../types";

import { randomUUID } from "node:crypto";

import { generateApiKey } from "../api-keys";
import { db, nowIso } from "../db";

import { getAccountSummary, listCreditLedger } from "./billing";
import { type UsageRow, toUsageSummary } from "./shared";
import { getCustomerPurchasedMicros, listCustomerTopups } from "./topups";

export type CustomerKeyRow = {
  id: string;
  name: string;
  prefix: string;
  status: string;
  created_at: string;
  last_used_at: string | null;
};

function toKey(row: CustomerKeyRow): KeySummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    status: row.status,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export function listCustomerApiKeys(userId: string): KeySummary[] {
  const rows = db
    .prepare(
      `SELECT id, name, prefix, status, created_at, last_used_at
       FROM api_keys
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC`,
    )
    .all(userId) as CustomerKeyRow[];

  return rows.map(toKey);
}

export function createCustomerApiKey(userId: string, name: string) {
  const keyName = name.trim().slice(0, 80) || "API key";
  const { secret, prefix, secretHash } = generateApiKey();
  const keyId = `key_${randomUUID()}`;
  const createdAt = nowIso();

  db.prepare(
    `INSERT INTO api_keys
      (id, user_id, name, prefix, secret_hash, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`,
  ).run(keyId, userId, keyName, prefix, secretHash, createdAt);

  return {
    key: {
      id: keyId,
      name: keyName,
      prefix,
      status: "active",
      createdAt,
      lastUsedAt: null,
    } satisfies KeySummary,
    secret,
  };
}

export function revokeCustomerApiKey(userId: string, keyId: string) {
  const result = db
    .prepare(
      `UPDATE api_keys SET status = 'revoked'
       WHERE id = ? AND user_id = ? AND status = 'active'`,
    )
    .run(keyId, userId);

  return result.changes > 0;
}

const USAGE_COLUMNS = `
  u.id, u.model_id, m.name AS model_name, k.prefix AS key_prefix,
  u.input_tokens, u.output_tokens, u.weighted_tokens, u.charged_micros,
  u.cost_micros, u.status, u.latency_ms, u.error, u.created_at
`;

export function listCustomerUsage(userId: string, limit = 25): UsageSummary[] {
  const rows = db
    .prepare(
      `SELECT ${USAGE_COLUMNS}
       FROM usage_events u
       LEFT JOIN models m ON m.id = u.model_id
       LEFT JOIN api_keys k ON k.id = u.api_key_id
       WHERE u.user_id = ?
       ORDER BY datetime(u.created_at) DESC
       LIMIT ?`,
    )
    .all(userId, limit) as UsageRow[];

  return rows.map(toUsageSummary);
}

export function getCustomerUsageTotals(userId: string) {
  return db
    .prepare(
      `SELECT COUNT(*) AS requests,
              COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
       FROM usage_events WHERE user_id = ?`,
    )
    .get(userId) as { requests: number; tokens: number };
}

export function getCustomerAccount(customer: Customer): CustomerAccount {
  const totals = getCustomerUsageTotals(customer.id);

  return {
    customer,
    account: getAccountSummary(customer.id),
    totalPurchasedMicros: getCustomerPurchasedMicros(customer.id),
    totalRequests: totals.requests,
    totalTokens: totals.tokens,
    keys: listCustomerApiKeys(customer.id),
    usage: listCustomerUsage(customer.id, 25),
    ledger: listCreditLedger(20, customer.id),
    topups: listCustomerTopups(customer.id, 10),
  };
}
