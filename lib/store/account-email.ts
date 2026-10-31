import "server-only";

import { db } from "../db";

export function accountEmailStatus(userId: string) {
  const user = db
    .prepare("SELECT email_verified_at FROM users WHERE id = ?")
    .get(userId) as { email_verified_at: string | null } | undefined;

  return { verified: Boolean(user?.email_verified_at) };
}
