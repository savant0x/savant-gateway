import "server-only";

import type { Customer, CustomerSummary } from "../types";

import { randomUUID } from "node:crypto";

import {
  CUSTOMER_SESSION_TTL_SECONDS,
  generateSessionToken,
  hashSessionToken,
  isSessionToken,
} from "../customer-session";
import { db, nowIso } from "../db";

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

export function findCustomerByEmail(email: string): CustomerRecord | null {
  const row = db
    .prepare(
      `SELECT ${CUSTOMER_COLUMNS} FROM users
       WHERE lower(email) = lower(?) AND password_hash IS NOT NULL`,
    )
    .get(email) as CustomerRow | undefined;

  return row ? toRecord(row) : null;
}

export function findCustomerById(id: string): CustomerRecord | null {
  const row = db
    .prepare(
      `SELECT ${CUSTOMER_COLUMNS} FROM users
       WHERE id = ? AND password_hash IS NOT NULL`,
    )
    .get(id) as CustomerRow | undefined;

  return row ? toRecord(row) : null;
}

export function createCustomer(input: {
  email: string;
  name: string;
  passwordHash: string;
}) {
  const id = `cust_${randomUUID()}`;
  const createdAt = nowIso();

  db.prepare(
    `INSERT INTO users
      (id, email, name, status, created_at, password_hash, credit_micros, held_micros)
     VALUES (?, ?, ?, 'active', ?, ?, 0, 0)`,
  ).run(id, input.email, input.name, createdAt, input.passwordHash);

  return {
    id,
    email: input.email,
    name: input.name,
    status: "active",
    createdAt,
  } satisfies Customer;
}

export function markCustomerLogin(id: string) {
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(
    nowIso(),
    id,
  );
}

export function createCustomerSession(userId: string, now = Date.now()) {
  const token = generateSessionToken();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(
    now + CUSTOMER_SESSION_TTL_SECONDS * 1000,
  ).toISOString();

  db.transaction(() => {
    db.prepare("DELETE FROM customer_sessions WHERE expires_at <= ?").run(
      createdAt,
    );

    db.prepare(
      `INSERT INTO customer_sessions
        (id, user_id, token_hash, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    ).run(
      `sess_${randomUUID()}`,
      userId,
      hashSessionToken(token),
      createdAt,
      expiresAt,
    );
  }).immediate();

  return { token, expiresAt };
}

export function resolveCustomerSession(
  token: string | null | undefined,
): Customer | null {
  if (!isSessionToken(token)) return null;

  const row = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.status, u.created_at,
              u.password_hash, u.last_login_at
       FROM customer_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?
         AND s.revoked_at IS NULL
         AND s.expires_at > ?
         AND u.status = 'active'
         AND u.password_hash IS NOT NULL`,
    )
    .get(hashSessionToken(token), nowIso()) as CustomerRow | undefined;

  return row ? toCustomer(row) : null;
}

export function revokeCustomerSession(token: string | null | undefined) {
  if (!isSessionToken(token)) return false;

  const result = db
    .prepare(
      `UPDATE customer_sessions SET revoked_at = ?
       WHERE token_hash = ? AND revoked_at IS NULL`,
    )
    .run(nowIso(), hashSessionToken(token));

  return result.changes > 0;
}

export function listCustomerSummaries(limit = 200): CustomerSummary[] {
  const rows = db
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
       ORDER BY datetime(u.created_at) DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    email: string;
    name: string;
    status: string;
    created_at: string;
    credit_micros: number;
    held_micros: number;
    key_count: number;
    request_count: number;
    charged_micros: number;
    last_topup_at: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    creditMicros: row.credit_micros,
    heldMicros: row.held_micros,
    keyCount: row.key_count,
    requestCount: row.request_count,
    chargedMicros: row.charged_micros,
    lastTopupAt: row.last_topup_at,
  }));
}
