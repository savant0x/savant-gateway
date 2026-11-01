import type { PostgresDatabase } from "../pg-adapter.ts";
import type { KeySummary } from "../../types.ts";

import { randomUUID } from "node:crypto";

import { generateApiKey, hashApiKey } from "../../api-key-crypto.ts";
import {
  toKeySummary,
  type AuthenticatedKey,
  type KeyRow,
} from "../../projections.ts";

/**
 * API key store, ported to the async handle (FID-085 step 4).
 *
 * The projection is `toKeySummary` from `lib/projections.ts` — the same function
 * the live store uses — so a key rendered by the ported path and a key rendered
 * by the current path cannot disagree about its shape.
 *
 * `created_at` is ISO-8601 text, so ordering takes an explicit `::timestamptz`
 * cast. Text order and time order agree for this format, but the cast states the
 * intent instead of relying on the coincidence.
 */

const DEV_USER = "user_dev";

export async function listApiKeys(
  db: PostgresDatabase,
  userId = DEV_USER,
): Promise<KeySummary[]> {
  const rows = await db
    .prepare(
      `SELECT id, name, prefix, status, created_at, last_used_at
         FROM api_keys
        WHERE user_id = ?
        ORDER BY created_at::timestamptz DESC`,
    )
    .all<KeyRow>(userId);

  return rows.map(toKeySummary);
}

export async function createDevApiKey(
  db: PostgresDatabase,
  name: string,
  userId = DEV_USER,
) {
  const keyName = name.trim() || "Development key";
  const { secret, prefix, secretHash } = generateApiKey();
  const keyId = `key_${randomUUID()}`;
  const createdAt = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    )
    .run(keyId, userId, keyName, prefix, secretHash, createdAt);

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

export async function revokeApiKey(
  db: PostgresDatabase,
  keyId: string,
  userId = DEV_USER,
) {
  const result = await db
    .prepare(
      "UPDATE api_keys SET status = 'revoked' WHERE id = ? AND user_id = ?",
    )
    .run(keyId, userId);

  return result.changes > 0;
}

export async function authenticateApiKey(
  db: PostgresDatabase,
  secret: string,
): Promise<AuthenticatedKey | null> {
  const row = await db
    .prepare(
      `SELECT k.id, k.user_id, k.prefix, k.status AS key_status, u.status AS user_status
         FROM api_keys k
         JOIN users u ON u.id = k.user_id
        WHERE k.secret_hash = ?`,
    )
    .get<{
      id: string;
      user_id: string;
      prefix: string;
      key_status: string;
      user_status: string;
    }>(hashApiKey(secret));

  if (!row || row.key_status !== "active" || row.user_status !== "active")
    return null;

  await db
    .prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
    .run(new Date().toISOString(), row.id);

  return { keyId: row.id, userId: row.user_id, keyPrefix: row.prefix };
}
