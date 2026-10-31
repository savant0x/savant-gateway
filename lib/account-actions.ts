import type { DatabaseHandle } from "./schema/columns.ts";

import { randomUUID } from "node:crypto";

import {
  generateSessionToken,
  hashSessionToken,
  isSessionToken,
} from "./customer-session.ts";

export type AccountActionPurpose = "verify" | "reset";
type ActionRow = {
  id: string;
  user_id: string;
  email: string;
  purpose: AccountActionPurpose;
};

type IssueInput = {
  userId: string;
  email: string;
  purpose: AccountActionPurpose;
  now: number;
};

export function issueAccountAction(
  database: DatabaseHandle,
  input: IssueInput,
) {
  const issue = database.transaction(() => {
    const user = database
      .prepare(
        "SELECT id FROM users WHERE id = ? AND email = ? AND status = 'active' AND password_hash IS NOT NULL",
      )
      .get(input.userId, input.email);
    const count = database
      .prepare(
        "SELECT COUNT(*) AS n FROM account_actions WHERE user_id = ? AND purpose = ? AND created_at > ?",
      )
      .get(input.userId, input.purpose, input.now - 3_600_000) as { n: number };

    if (!user || count.n >= 3) return null;

    const token = generateSessionToken();
    const id = `action_${randomUUID()}`;
    const expiresAt =
      input.now + (input.purpose === "verify" ? 86_400_000 : 1_800_000);

    database
      .prepare(
        "UPDATE account_actions SET consumed_at = ? WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL",
      )
      .run(input.now, input.userId, input.purpose);
    database
      .prepare(
        `INSERT INTO account_actions
       (id, user_id, email, purpose, token_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.userId,
        input.email,
        input.purpose,
        hashSessionToken(token),
        input.now,
        expiresAt,
      );

    return { id, token, expiresAt };
  });

  return issue.immediate();
}

export function recordActionDelivery(
  database: DatabaseHandle,
  id: string,
  delivered: boolean,
) {
  database
    .prepare(
      "UPDATE account_actions SET delivery_state = ? WHERE id = ? AND delivery_state = 'pending'",
    )
    .run(delivered ? "sent" : "failed", id);
}

type ConsumeInput = {
  token: string;
  purpose: AccountActionPurpose;
  passwordHash?: string;
  now: number;
};

export function consumeAccountAction(
  database: DatabaseHandle,
  input: ConsumeInput,
) {
  if (!isSessionToken(input.token)) return false;
  if (input.purpose === "reset" && !input.passwordHash) return false;

  const consume = database.transaction(() => {
    const row = database
      .prepare(
        `SELECT a.id, a.user_id, a.email, a.purpose FROM account_actions a
       JOIN users u ON u.id = a.user_id
       WHERE a.token_hash = ? AND a.purpose = ? AND a.consumed_at IS NULL
         AND a.expires_at > ? AND a.delivery_state = 'sent'
         AND a.email = u.email AND u.status = 'active' AND u.password_hash IS NOT NULL`,
      )
      .get(hashSessionToken(input.token), input.purpose, input.now) as
      ActionRow | undefined;

    if (!row) return false;

    database
      .prepare("UPDATE account_actions SET consumed_at = ? WHERE id = ?")
      .run(input.now, row.id);
    const now = new Date(input.now).toISOString();

    if (row.purpose === "verify") {
      database
        .prepare(
          "UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?",
        )
        .run(now, row.user_id);
    } else {
      database
        .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
        .run(input.passwordHash, row.user_id);
      database
        .prepare(
          "UPDATE customer_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
        )
        .run(now, row.user_id);
      database
        .prepare(
          "UPDATE api_keys SET status = 'revoked' WHERE user_id = ? AND status = 'active'",
        )
        .run(row.user_id);
      database
        .prepare(
          "UPDATE account_actions SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL",
        )
        .run(input.now, row.user_id);
    }

    return true;
  });

  return consume.immediate();
}
