import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Email verification state, ported to the async handle (FID-086 Batch A).
 *
 * Small on purpose: the account page needs to know whether the address is
 * verified, and the answer is one column. The verification flow itself lives in
 * `lib/store/admin.ts` with the account actions, which is Batch B.
 */
export async function accountEmailStatus(db: PostgresDatabase, userId: string) {
  const user = await db
    .prepare("SELECT email_verified_at FROM users WHERE id = ?")
    .get<{ email_verified_at: string | null }>(userId);

  return { verified: Boolean(user?.email_verified_at) };
}
