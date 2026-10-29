import "server-only";

import { db } from "../db";

type EpochRow = { session_epoch: number };

export function getAdminSessionEpoch(): number {
  const row = db
    .prepare("SELECT session_epoch FROM admin_state WHERE id = 1")
    .get() as EpochRow | undefined;

  return row?.session_epoch ?? 0;
}

export function bumpAdminSessionEpoch(): number {
  db.prepare(
    "UPDATE admin_state SET session_epoch = session_epoch + 1 WHERE id = 1",
  ).run();

  return getAdminSessionEpoch();
}
