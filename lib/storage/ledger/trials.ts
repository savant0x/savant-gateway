import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Trial ledger, ported to the async handle (FID-085 step 3).
 *
 * Unchanged semantics: a grant is issued once per account when the account is
 * verified and the budget allows, a reservation is refused when the remaining
 * balance cannot cover it, and settlement is idempotent because it only updates
 * a reservation that is still open.
 *
 * The grant uses the account's historic free-pool usage as its opening `used`
 * figure, so an account that already consumed the free pool does not receive a
 * second full trial.
 */

export type TrialBalance = {
  granted: number;
  used: number;
  held: number;
  remaining: number;
};

export async function trialBalance(
  db: PostgresDatabase,
  userId: string,
  now: string,
): Promise<TrialBalance> {
  const grant = await db
    .prepare(
      "SELECT granted_tokens, used_tokens FROM trial_grants WHERE user_id = ?",
    )
    .get<{ granted_tokens: number; used_tokens: number }>(userId);
  const held = await db
    .prepare(
      `SELECT COALESCE(SUM(reserved_tokens), 0) AS total FROM trial_reservations
        WHERE user_id = ? AND settled_at IS NULL AND expires_at > ?`,
    )
    .get<{ total: number }>(userId, now);

  const granted = Number(grant?.granted_tokens ?? 0);
  const used = Number(grant?.used_tokens ?? 0);
  const heldTokens = Math.max(0, Number(held?.total ?? 0));

  return {
    granted,
    used,
    held: heldTokens,
    remaining: Math.max(0, granted - used - heldTokens),
  };
}

export async function reserveTrial(
  db: PostgresDatabase,
  input: {
    userId: string;
    id: string;
    estimated: number;
    now: string;
    expiresAt: string;
    config: { enabled: boolean; grantTokens: number; grantBudget: number };
  },
) {
  if (
    !input.config.enabled ||
    !Number.isSafeInteger(input.estimated) ||
    input.estimated <= 0
  ) {
    return false;
  }

  if (input.config.grantTokens <= 0) return false;

  return db
    .transaction(async () => {
      // Every decision below is one statement, because a read followed by a
      // write lets concurrent calls both see the same balance. The row lock
      // serializes them on PostgreSQL; the conditional inserts keep the rule
      // true on engines where the lock cannot exclude.
      await db
        .prepare("SELECT id FROM users WHERE id = ? FOR UPDATE")
        .get(input.userId);

      const historic = await db
        .prepare(
          "SELECT COALESCE(SUM(weighted_tokens), 0) AS total FROM free_pool_usage WHERE user_id = ?",
        )
        .get<{ total: number }>(input.userId);

      await db
        .prepare(
          `INSERT INTO trial_grants (user_id, granted_tokens, used_tokens, issued_at)
           SELECT ?, ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM users
                           WHERE id = ? AND email_verified_at IS NOT NULL)
              AND (SELECT COALESCE(SUM(granted_tokens), 0) FROM trial_grants)
                    + ? <= ?
           ON CONFLICT (user_id) DO NOTHING`,
        )
        .run(
          input.userId,
          input.config.grantTokens,
          Number(historic?.total ?? 0),
          input.now,
          input.userId,
          input.config.grantTokens,
          input.config.grantBudget,
        );

      const reserved = await db
        .prepare(
          `INSERT INTO trial_reservations
            (id, user_id, reserved_tokens, created_at, expires_at)
           SELECT ?, ?, ?, ?, ?
            WHERE COALESCE((SELECT granted_tokens - used_tokens
                              FROM trial_grants WHERE user_id = ?), 0)
                - (SELECT COALESCE(SUM(reserved_tokens), 0)
                     FROM trial_reservations
                    WHERE user_id = ? AND settled_at IS NULL
                      AND expires_at > ?) >= ?`,
        )
        .run(
          input.id,
          input.userId,
          input.estimated,
          input.now,
          input.expiresAt,
          input.userId,
          input.userId,
          input.now,
          input.estimated,
        );

      return reserved.changes > 0;
    })
    .immediate();
}

/**
 * Runs inside the usage transaction; retained rows make late settlement and
 * replay safe. Returns false when the reservation is already settled, so a
 * retried callback cannot count the same tokens twice.
 */
export async function settleTrial(
  db: PostgresDatabase,
  input: { id: string; userId: string; actual: number; now: string },
) {
  if (!Number.isSafeInteger(input.actual) || input.actual < 0) {
    throw new Error("Trial usage must be a nonnegative safe integer.");
  }

  const result = await db
    .prepare(
      `UPDATE trial_reservations
          SET actual_tokens = ?, settled_at = ?
        WHERE id = ? AND user_id = ? AND settled_at IS NULL`,
    )
    .run(input.actual, input.now, input.id, input.userId);

  if (result.changes === 0) return false;

  await db
    .prepare(
      "UPDATE trial_grants SET used_tokens = used_tokens + ? WHERE user_id = ?",
    )
    .run(input.actual, input.userId);

  return true;
}
