import type { DatabaseHandle } from "./schema/columns";
import type { TrialConfig } from "./trials";

type GrantRow = { granted_tokens: number; used_tokens: number };

export function trialBalance(
  database: DatabaseHandle,
  userId: string,
  now: string,
) {
  const grant = database
    .prepare(
      "SELECT granted_tokens, used_tokens FROM trial_grants WHERE user_id = ?",
    )
    .get(userId) as GrantRow | undefined;
  const held = database
    .prepare(
      `SELECT COALESCE(SUM(reserved_tokens), 0) AS total FROM trial_reservations
     WHERE user_id = ? AND settled_at IS NULL AND expires_at > ?`,
    )
    .get(userId, now) as { total: number };

  return {
    granted: grant?.granted_tokens ?? 0,
    used: grant?.used_tokens ?? 0,
    held: held.total,
    remaining: Math.max(
      0,
      (grant?.granted_tokens ?? 0) - (grant?.used_tokens ?? 0) - held.total,
    ),
  };
}

export function reserveTrial(
  database: DatabaseHandle,
  input: {
    userId: string;
    id: string;
    estimated: number;
    now: string;
    expiresAt: string;
    config: TrialConfig;
  },
) {
  if (
    !input.config.enabled ||
    !Number.isSafeInteger(input.estimated) ||
    input.estimated <= 0
  ) {
    return false;
  }

  return database
    .transaction(() => {
      const existing = database
        .prepare("SELECT user_id FROM trial_grants WHERE user_id = ?")
        .get(input.userId);

      if (!existing) {
        const user = database
          .prepare("SELECT email_verified_at FROM users WHERE id = ?")
          .get(input.userId) as
          { email_verified_at: string | null } | undefined;
        const issued = database
          .prepare(
            "SELECT COALESCE(SUM(granted_tokens), 0) AS total FROM trial_grants",
          )
          .get() as { total: number };

        if (
          !user?.email_verified_at ||
          input.config.grantTokens <= 0 ||
          issued.total + input.config.grantTokens > input.config.grantBudget
        )
          return false;

        const historic = database
          .prepare(
            "SELECT COALESCE(SUM(weighted_tokens), 0) AS total FROM free_pool_usage WHERE user_id = ?",
          )
          .get(input.userId) as { total: number };

        database
          .prepare(
            "INSERT INTO trial_grants (user_id, granted_tokens, used_tokens, issued_at) VALUES (?, ?, ?, ?)",
          )
          .run(
            input.userId,
            input.config.grantTokens,
            historic.total,
            input.now,
          );
      }

      if (
        trialBalance(database, input.userId, input.now).remaining <
        input.estimated
      )
        return false;

      database
        .prepare(
          `INSERT INTO trial_reservations (id, user_id, reserved_tokens, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          input.id,
          input.userId,
          input.estimated,
          input.now,
          input.expiresAt,
        );

      return true;
    })
    .immediate();
}

/** Runs inside the usage transaction; retained rows make late settlement and replay safe. */
export function settleTrial(
  database: DatabaseHandle,
  input: {
    id: string;
    userId: string;
    actual: number;
    now: string;
  },
) {
  if (!Number.isSafeInteger(input.actual) || input.actual < 0) {
    throw new Error("Trial usage must be a nonnegative safe integer.");
  }
  const result = database
    .prepare(
      `UPDATE trial_reservations SET actual_tokens = ?, settled_at = ?
     WHERE id = ? AND user_id = ? AND settled_at IS NULL`,
    )
    .run(input.actual, input.now, input.id, input.userId);

  if (result.changes === 0) return false;

  database
    .prepare(
      "UPDATE trial_grants SET used_tokens = used_tokens + ? WHERE user_id = ?",
    )
    .run(input.actual, input.userId);

  return true;
}
