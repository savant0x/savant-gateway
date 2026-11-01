import type { PostgresDatabase } from "../pg-adapter.ts";
import type { Customer, CustomerSummary } from "../../types.ts";

import { randomUUID } from "node:crypto";

import {
  CUSTOMER_SESSION_TTL_SECONDS,
  generateSessionToken,
  hashSessionToken,
  isSessionToken,
} from "../../customer-session.ts";
import { insertActivity } from "../ledger/activity.ts";

/**
 * Customer identity store, ported to the async handle (FID-086 Batch A).
 *
 * Two shapes change and nothing else:
 *
 * 1. `ORDER BY datetime(x)` becomes `ORDER BY x::timestamptz`. The column is
 *    ISO-8601 text, so both orders agree; the cast states which one is meant.
 * 2. Aggregate columns (`COUNT`, `SUM`) arrive as strings because they are
 *    `BIGINT`. They are coerced here so a summary never carries `"3"` where the
 *    type says number.
 *
 * The lookup by email stays case-insensitive through `lower(email)`, which is
 * what the SQLite `COLLATE NOCASE` index used to provide. The PostgreSQL schema
 * declares `email` unique as written, so signup must go through this lookup
 * rather than relying on the constraint to catch a case variant.
 */

type CustomerRow = {
  id: string;
  email: string;
  name: string;
  status: string;
  created_at: string;
  password_hash: string | null;
  last_login_at: string | null;
};

export type CustomerRecord = Customer & {
  passwordHash: string | null;
  lastLoginAt: string | null;
};

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toRecord(row: CustomerRow): CustomerRecord {
  return {
    ...toCustomer(row),
    passwordHash: row.password_hash,
    lastLoginAt: row.last_login_at,
  };
}

const CUSTOMER_COLUMNS =
  "id, email, name, status, created_at, password_hash, last_login_at";

export async function findCustomerByEmail(
  db: PostgresDatabase,
  email: string,
): Promise<CustomerRecord | null> {
  const row = await db
    .prepare(
      `SELECT ${CUSTOMER_COLUMNS} FROM users
        WHERE lower(email) = lower(?) AND password_hash IS NOT NULL`,
    )
    .get<CustomerRow>(email);

  return row ? toRecord(row) : null;
}

export async function findCustomerById(
  db: PostgresDatabase,
  id: string,
): Promise<CustomerRecord | null> {
  const row = await db
    .prepare(
      `SELECT ${CUSTOMER_COLUMNS} FROM users
        WHERE id = ? AND password_hash IS NOT NULL`,
    )
    .get<CustomerRow>(id);

  return row ? toRecord(row) : null;
}

export async function createCustomer(
  db: PostgresDatabase,
  input: { email: string; name: string; passwordHash: string },
) {
  const id = `cust_${randomUUID()}`;
  const createdAt = new Date().toISOString();

  await db
    .transaction(async () => {
      await db
        .prepare(
          `INSERT INTO users
            (id, email, name, status, created_at, password_hash,
             credit_micros, held_micros)
           VALUES (?, ?, ?, 'active', ?, ?, 0, 0)`,
        )
        .run(id, input.email, input.name, createdAt, input.passwordHash);

      await insertActivity(db, {
        userId: id,
        actor: "customer",
        kind: "customer.signup",
        entityType: "customer",
        entityId: id,
        now: createdAt,
      });
    })
    .immediate();

  return {
    id,
    email: input.email,
    name: input.name,
    status: "active",
    createdAt,
  } satisfies Customer;
}

export async function markCustomerLogin(db: PostgresDatabase, id: string) {
  await db
    .prepare("UPDATE users SET last_login_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
}

export async function createCustomerSession(
  db: PostgresDatabase,
  userId: string,
  now = Date.now(),
) {
  const token = generateSessionToken();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(
    now + CUSTOMER_SESSION_TTL_SECONDS * 1000,
  ).toISOString();

  await db
    .transaction(async () => {
      await db
        .prepare("DELETE FROM customer_sessions WHERE expires_at <= ?")
        .run(createdAt);

      await db
        .prepare(
          `INSERT INTO customer_sessions
            (id, user_id, token_hash, created_at, expires_at, revoked_at)
           VALUES (?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          `sess_${randomUUID()}`,
          userId,
          hashSessionToken(token),
          createdAt,
          expiresAt,
        );
    })
    .immediate();

  return { token, expiresAt };
}

/**
 * Resolves a cookie token to a live customer. The comparisons stay in SQL so an
 * expired or revoked session cannot be admitted by a race between two reads.
 */
export async function resolveCustomerSession(
  db: PostgresDatabase,
  token: string | null | undefined,
): Promise<Customer | null> {
  if (!isSessionToken(token)) return null;

  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.status, u.created_at,
              u.password_hash, u.last_login_at
         FROM customer_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?
          AND s.revoked_at IS NULL
          AND s.expires_at::timestamptz > ?::timestamptz
          AND u.status = 'active'
          AND u.password_hash IS NOT NULL`,
    )
    .get<CustomerRow>(hashSessionToken(token), new Date().toISOString());

  return row ? toCustomer(row) : null;
}

export async function revokeCustomerSession(
  db: PostgresDatabase,
  token: string | null | undefined,
) {
  if (!isSessionToken(token)) return false;

  const revoked = await db
    .prepare(
      `UPDATE customer_sessions SET revoked_at = ?
        WHERE token_hash = ? AND revoked_at IS NULL
       RETURNING id`,
    )
    .all(new Date().toISOString(), hashSessionToken(token));

  return revoked.length > 0;
}

export async function listCustomerSummaries(
  db: PostgresDatabase,
  limit = 200,
): Promise<CustomerSummary[]> {
  const rows = await db
    .prepare(
      `SELECT
         u.id, u.email, u.name, u.status, u.created_at,
         u.credit_micros, u.held_micros,
         (SELECT COUNT(*) FROM api_keys k
           WHERE k.user_id = u.id AND k.status = 'active') AS key_count,
         (SELECT COUNT(*) FROM usage_events e
           WHERE e.user_id = u.id) AS request_count,
         (SELECT COALESCE(SUM(e.charged_micros), 0) FROM usage_events e
           WHERE e.user_id = u.id) AS charged_micros,
         (SELECT MAX(t.paid_at) FROM topups t
           WHERE t.user_id = u.id AND t.status = 'paid') AS last_topup_at
       FROM users u
       WHERE u.password_hash IS NOT NULL
       ORDER BY u.created_at::timestamptz DESC
       LIMIT ?`,
    )
    .all<{
      id: string;
      email: string;
      name: string;
      status: string;
      created_at: string;
      credit_micros: number | string;
      held_micros: number | string;
      key_count: number | string;
      request_count: number | string;
      charged_micros: number | string;
      last_topup_at: string | null;
    }>(limit);

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    creditMicros: Number(row.credit_micros),
    heldMicros: Number(row.held_micros),
    keyCount: Number(row.key_count),
    requestCount: Number(row.request_count),
    chargedMicros: Number(row.charged_micros),
    lastTopupAt: row.last_topup_at,
  }));
}
