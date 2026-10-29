import "server-only";

import type { KeySummary } from "../types";

import { randomUUID } from "node:crypto";

import { generateApiKey, hashApiKey } from "../api-keys";
import { db, nowIso } from "../db";

import { type AuthenticatedKey, type KeyRow, toKeySummary } from "./shared";

export function listApiKeys(): KeySummary[] {
  const rows = db
    .prepare(
      `SELECT id, name, prefix, status, created_at, last_used_at
       FROM api_keys
       WHERE user_id = 'user_dev'
       ORDER BY datetime(created_at) DESC`,
    )
    .all() as KeyRow[];

  return rows.map(toKeySummary);
}

export function createDevApiKey(name: string) {
  const keyName = name.trim() || "Development key";
  const { secret, prefix, secretHash } = generateApiKey();
  const keyId = `key_${randomUUID()}`;
  const createdAt = nowIso();

  db.prepare(
    `INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, status, created_at)
     VALUES (?, 'user_dev', ?, ?, ?, 'active', ?)`,
  ).run(keyId, keyName, prefix, secretHash, createdAt);

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

export function revokeApiKey(keyId: string) {
  const result = db
    .prepare(
      "UPDATE api_keys SET status = 'revoked' WHERE id = ? AND user_id = 'user_dev'",
    )
    .run(keyId);

  return result.changes > 0;
}

export function authenticateApiKey(secret: string): AuthenticatedKey | null {
  const row = db
    .prepare(
      `SELECT k.id, k.user_id, k.prefix, k.status AS key_status, u.status AS user_status
       FROM api_keys k
       JOIN users u ON u.id = k.user_id
       WHERE k.secret_hash = ?`,
    )
    .get(hashApiKey(secret)) as
    | {
        id: string;
        user_id: string;
        prefix: string;
        key_status: string;
        user_status: string;
      }
    | undefined;

  if (!row || row.key_status !== "active" || row.user_status !== "active")
    return null;

  db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(
    nowIso(),
    row.id,
  );

  return { keyId: row.id, userId: row.user_id, keyPrefix: row.prefix };
}
