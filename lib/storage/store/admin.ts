import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Admin session epoch, ported to the async handle (FID-086 Batch B).
 *
 * The epoch is what invalidates every issued admin cookie: a session carries the
 * value it was signed with, so incrementing it logs every operator out.
 *
 * The increment reads its result from the same statement (`RETURNING`) rather
 * than selecting afterwards. The SQLite version did two statements and was
 * correct only because nothing else wrote while it ran; here a concurrent bump
 * would make the read-after-write report someone else's number.
 */
export async function getAdminSessionEpoch(
  db: PostgresDatabase,
): Promise<number> {
  const row = await db
    .prepare("SELECT session_epoch FROM admin_state WHERE id = 1")
    .get<{ session_epoch: number | string }>();

  return Number(row?.session_epoch ?? 0);
}

export async function bumpAdminSessionEpoch(
  db: PostgresDatabase,
): Promise<number> {
  const row = await db
    .prepare(
      `UPDATE admin_state
          SET session_epoch = session_epoch + 1
        WHERE id = 1
      RETURNING session_epoch`,
    )
    .get<{ session_epoch: number | string }>();

  return Number(row?.session_epoch ?? 0);
}
