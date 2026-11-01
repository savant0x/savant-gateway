import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * The credit invariant, in one place (FID-2026-1031-086).
 *
 * `users.credit_micros` is what the gateway spends from; `credit_ledger` is the
 * only record of why it holds that value. A database where the two disagree is
 * not a restore point, so the importer, the backup and the recovery drill all
 * ask this function instead of each writing their own SQL — three opinions about
 * the money equation would be three chances to accept a bad copy.
 *
 * `credit_holds` is checked separately from `held_micros` for the same reason:
 * a hold that exists without reserving, or a reservation with no hold, is a
 * double-spend waiting for the next request.
 *
 * Balance baselines are deliberately outside this equation. A baseline exists
 * precisely because a period of history is not reconstructible from the ledger,
 * so folding it in here would let that history pass silently; reconciliation
 * reports it separately.
 */

export type BalanceAudit = {
  checked: number;
  mismatches: string[];
};

export async function balanceAudit(
  db: PostgresDatabase,
): Promise<BalanceAudit> {
  const rows = await db.query<{
    id: string;
    credit_micros: string;
    held_micros: string;
    ledger_total: string;
    held_total: string;
  }>(
    `SELECT u.id,
            u.credit_micros,
            u.held_micros,
            COALESCE((SELECT SUM(l.amount_micros) FROM credit_ledger l
                       WHERE l.user_id = u.id), 0) AS ledger_total,
            COALESCE((SELECT SUM(h.hold_micros) FROM credit_holds h
                       WHERE h.user_id = u.id), 0) AS held_total
       FROM users u
      ORDER BY u.id`,
  );
  const mismatches: string[] = [];

  for (const row of rows) {
    if (Number(row.credit_micros) !== Number(row.ledger_total)) {
      mismatches.push(
        `${row.id}: credit ${row.credit_micros} ≠ ledger ${row.ledger_total}`,
      );
    }

    if (Number(row.held_micros) !== Number(row.held_total)) {
      mismatches.push(
        `${row.id}: held ${row.held_micros} ≠ live holds ${row.held_total}`,
      );
    }
  }

  return { checked: rows.length, mismatches };
}
