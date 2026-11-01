import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  Customer,
  CustomerAccount,
  KeySummary,
  UsageSummary,
} from "../../types.ts";

import { randomUUID } from "node:crypto";

import { generateApiKey } from "../../api-key-crypto.ts";
import {
  toKeySummary,
  toUsageSummary,
  type KeyRow,
} from "../../projections.ts";
import { insertActivity } from "../ledger/activity.ts";

import { getAccountSummary, listCreditLedger } from "./billing.ts";
import { getCustomerPurchasedMicros, listCustomerTopups } from "./topups.ts";

/**
 * The account page's read model, ported to the async handle (FID-086 Batch A).
 *
 * `getCustomerAccount` composes five reads that used to be synchronous calls
 * into a module singleton. They stay separate statements rather than becoming
 * one join, because each of them is also rendered on its own elsewhere (keys,
 * usage, ledger, top-ups) and a single combined query would duplicate those
 * projections.
 *
 * The key-creation cap keeps its two rules — ten active keys, twenty created in
 * the last hour — but counts them in SQL with `FILTER`, since PostgreSQL has no
 * `SUM(boolean)` and the SQLite habit of summing a predicate is a type error
 * here.
 */

type CustomerKeyRow = KeyRow;

export async function listCustomerApiKeys(
  db: PostgresDatabase,
  userId: string,
): Promise<KeySummary[]> {
  const rows = await db
    .prepare(
      `SELECT id, name, prefix, status, created_at, last_used_at
         FROM api_keys
        WHERE user_id = ?
        ORDER BY created_at::timestamptz DESC`,
    )
    .all<CustomerKeyRow>(userId);

  return rows.map(toKeySummary);
}

export async function createCustomerApiKey(
  db: PostgresDatabase,
  userId: string,
  name: string,
) {
  const keyName = name.trim().slice(0, 80) || "API key";
  const { secret, prefix, secretHash } = generateApiKey();
  const keyId = `key_${randomUUID()}`;
  const createdAt = new Date().toISOString();

  const inserted = await db
    .transaction(async () => {
      const counts = await db
        .prepare(
          `SELECT COUNT(*) FILTER (WHERE status = 'active') AS active,
                  COUNT(*) FILTER (
                    WHERE created_at::timestamptz > ?::timestamptz - interval '1 hour'
                  ) AS recent
             FROM api_keys WHERE user_id = ?`,
        )
        .get<{ active: number | string; recent: number | string }>(
          createdAt,
          userId,
        );

      if (
        Number(counts?.active ?? 0) >= 10 ||
        Number(counts?.recent ?? 0) >= 20
      )
        return false;

      await db
        .prepare(
          `INSERT INTO api_keys
            (id, user_id, name, prefix, secret_hash, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        )
        .run(keyId, userId, keyName, prefix, secretHash, createdAt);

      await insertActivity(db, {
        userId,
        actor: "customer",
        kind: "customer.key_created",
        entityType: "api_key",
        entityId: keyId,
        metadata: { keyId },
        now: createdAt,
      });

      return true;
    })
    .immediate();

  if (!inserted) return null;

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

export async function revokeCustomerApiKey(
  db: PostgresDatabase,
  userId: string,
  keyId: string,
) {
  return db
    .transaction(async () => {
      const revoked = await db
        .prepare(
          `UPDATE api_keys SET status = 'revoked'
            WHERE id = ? AND user_id = ? AND status = 'active'
           RETURNING id`,
        )
        .all(keyId, userId);

      if (revoked.length === 0) return false;

      await insertActivity(db, {
        userId,
        actor: "customer",
        kind: "customer.key_revoked",
        entityType: "api_key",
        entityId: keyId,
        metadata: { keyId },
      });

      return true;
    })
    .immediate();
}

const USAGE_COLUMNS = `
  u.id, u.model_id, m.name AS model_name, k.prefix AS key_prefix,
  u.input_tokens, u.output_tokens, u.weighted_tokens, u.charged_micros,
  u.cached_input_tokens, u.cache_write_input_tokens,
  u.reasoning_output_tokens, u.usage_source,
  u.cost_micros, u.status, u.latency_ms, u.error, u.created_at
`;

export async function listCustomerUsage(
  db: PostgresDatabase,
  userId: string,
  limit = 25,
): Promise<UsageSummary[]> {
  const rows = await db
    .prepare(
      `SELECT ${USAGE_COLUMNS}
         FROM usage_events u
         LEFT JOIN models m ON m.id = u.model_id
         LEFT JOIN api_keys k ON k.id = u.api_key_id
        WHERE u.user_id = ?
        ORDER BY u.created_at::timestamptz DESC
        LIMIT ?`,
    )
    .all<Parameters<typeof toUsageSummary>[0]>(userId, limit);

  return rows.map((row) =>
    toUsageSummary({
      ...row,
      input_tokens: Number(row.input_tokens),
      output_tokens: Number(row.output_tokens),
      weighted_tokens: Number(row.weighted_tokens),
      charged_micros: Number(row.charged_micros),
      cost_micros: Number(row.cost_micros),
      latency_ms: Number(row.latency_ms),
      cached_input_tokens:
        row.cached_input_tokens === null
          ? null
          : Number(row.cached_input_tokens),
      cache_write_input_tokens:
        row.cache_write_input_tokens === null
          ? null
          : Number(row.cache_write_input_tokens),
      reasoning_output_tokens:
        row.reasoning_output_tokens === null
          ? null
          : Number(row.reasoning_output_tokens),
    }),
  );
}

export async function getCustomerUsageTotals(
  db: PostgresDatabase,
  userId: string,
) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS requests,
              COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
         FROM usage_events WHERE user_id = ?`,
    )
    .get<{ requests: number | string; tokens: number | string }>(userId);

  return {
    requests: Number(row?.requests ?? 0),
    tokens: Number(row?.tokens ?? 0),
  };
}

export async function getCustomerAccount(
  db: PostgresDatabase,
  customer: Customer,
): Promise<CustomerAccount> {
  const [account, totalPurchasedMicros, totals, keys, usage, ledger, topups] =
    await Promise.all([
      getAccountSummary(db, customer.id),
      getCustomerPurchasedMicros(db, customer.id),
      getCustomerUsageTotals(db, customer.id),
      listCustomerApiKeys(db, customer.id),
      listCustomerUsage(db, customer.id, 25),
      listCreditLedger(db, 20, customer.id),
      listCustomerTopups(db, customer.id, 10),
    ]);

  return {
    customer,
    account,
    totalPurchasedMicros,
    totalRequests: totals.requests,
    totalTokens: totals.tokens,
    keys,
    usage,
    ledger,
    topups,
  };
}
