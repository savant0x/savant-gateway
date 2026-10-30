import type { DatabaseHandle } from "./schema/columns.ts";

/**
 * Credit reconciliation and append-only corrections.
 *
 * The customer balance is not an independent truth: it must equal the recorded
 * opening baseline plus every ledger entry. Where history predates ledger
 * coverage, an operator records a dated baseline; no row is invented to make
 * the equation agree.
 *
 * Adjustments are appends with a unique reference. A refund is bounded by the
 * current credit, so a correction cannot create debt, and a repeated reference
 * is a no-op rather than a second credit.
 */

export type AdjustmentKind = "refund" | "adjustment";

export type AdjustmentInput = {
  userId: string;
  amountMicros: number;
  kind: AdjustmentKind;
  reference: string;
  note: string;
  now: string;
};

export type AdjustmentResult =
  | { ok: true; created: boolean; entryId: string }
  | {
      ok: false;
      reason:
        | "unknown_user"
        | "invalid_amount"
        | "invalid_reference"
        | "reference_conflict"
        | "exceeds_balance";
    };

export type ReconciliationAccount = {
  userId: string;
  ledgerMicros: number;
  baselineMicros: number;
  balanceMicros: number;
  differenceMicros: number;
  balanced: boolean;
};

export type ReconciliationReport = {
  accounts: ReconciliationAccount[];
  totals: {
    ledgerMicros: number;
    baselineMicros: number;
    balanceMicros: number;
    expectedMicros: number;
    differenceMicros: number;
    balanced: boolean;
    usageDebitsMicros: number;
    topupMicros: number;
    heldMicros: number;
    quarantinedMicros: number;
    /** Net credit returned or corrected by operator adjustments. */
    adjustmentMicros: number;
  };
};

function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

export function applyAdjustment(
  database: DatabaseHandle,
  input: AdjustmentInput,
): AdjustmentResult {
  const reference = input.reference.trim();
  const amount = integer(input.amountMicros);
  const note = input.note.trim();

  if (reference.length < 3 || reference.length > 120) {
    return { ok: false, reason: "invalid_reference" };
  }
  if (amount === null || amount === 0) {
    return { ok: false, reason: "invalid_amount" };
  }
  if (input.kind === "refund" && amount < 0) {
    return { ok: false, reason: "invalid_amount" };
  }

  return database
    .transaction(() => {
      const user = database
        .prepare("SELECT credit_micros FROM users WHERE id = ?")
        .get(input.userId) as { credit_micros: number } | undefined;

      if (!user) return { ok: false as const, reason: "unknown_user" as const };

      const existing = database
        .prepare(
          `SELECT id, user_id, amount_micros FROM credit_ledger
           WHERE reference = ?`,
        )
        .get(reference) as
        { id: string; user_id: string; amount_micros: number } | undefined;

      if (existing) {
        return existing.user_id === input.userId &&
          existing.amount_micros === amount
          ? { ok: true as const, created: false, entryId: existing.id }
          : { ok: false as const, reason: "reference_conflict" as const };
      }

      // A refund returns credit the customer already holds; it can never mint
      // credit or exceed the current balance. A debit correction cannot push
      // the account below zero.
      if (
        (input.kind === "refund" && amount > user.credit_micros) ||
        user.credit_micros + amount < 0
      ) {
        return { ok: false as const, reason: "exceeds_balance" as const };
      }

      const balanceAfter = user.credit_micros + amount;

      const id = `ledger_adj_${reference}`;

      database
        .prepare(
          `INSERT INTO credit_ledger
            (id, user_id, kind, amount_micros, balance_after_micros, note,
             created_at, reference)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.userId,
          input.kind,
          amount,
          balanceAfter,
          note.slice(0, 300) || input.kind,
          input.now,
          reference,
        );
      database
        .prepare("UPDATE users SET credit_micros = ? WHERE id = ?")
        .run(balanceAfter, input.userId);

      return { ok: true as const, created: true, entryId: id };
    })
    .immediate();
}

/** Records the dated opening balance for legacy history; latest row wins. */
export function recordBaseline(
  database: DatabaseHandle,
  input: {
    userId: string;
    baselineMicros: number;
    note: string;
    id: string;
    now: string;
  },
) {
  const baseline = integer(input.baselineMicros);

  if (baseline === null || baseline < 0) return false;

  const user = database
    .prepare("SELECT 1 FROM users WHERE id = ?")
    .get(input.userId);

  if (!user) return false;

  database
    .prepare(
      `INSERT INTO balance_baselines
        (id, user_id, baseline_micros, note, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.userId,
      baseline,
      input.note.slice(0, 300) || null,
      input.now,
    );

  return true;
}

type AccountRow = {
  user_id: string;
  balance_micros: number;
  ledger_micros: number;
  baseline_micros: number | null;
};

export function reconcileDatabase(
  database: DatabaseHandle,
): ReconciliationReport {
  const rows = database
    .prepare(
      `SELECT u.id AS user_id, u.credit_micros AS balance_micros,
              COALESCE(l.total, 0) AS ledger_micros,
              b.baseline_micros AS baseline_micros
       FROM users u
       LEFT JOIN (
         SELECT user_id, SUM(amount_micros) AS total
         FROM credit_ledger GROUP BY user_id
       ) l ON l.user_id = u.id
       LEFT JOIN (
         SELECT user_id, baseline_micros FROM balance_baselines bb
         WHERE created_at = (
           SELECT MAX(created_at) FROM balance_baselines
           WHERE user_id = bb.user_id
         )
       ) b ON b.user_id = u.id
       ORDER BY u.id`,
    )
    .all() as AccountRow[];

  const accounts = rows.map((row) => {
    const baselineMicros = row.baseline_micros ?? 0;
    const expected = baselineMicros + row.ledger_micros;

    return {
      userId: row.user_id,
      ledgerMicros: row.ledger_micros,
      baselineMicros,
      balanceMicros: row.balance_micros,
      differenceMicros: row.balance_micros - expected,
      balanced: row.balance_micros === expected,
    };
  });

  const sum = (pick: (account: ReconciliationAccount) => number) =>
    accounts.reduce((total, account) => total + pick(account), 0);
  const baselineMicros = sum((account) => account.baselineMicros);
  const ledgerMicros = sum((account) => account.ledgerMicros);
  const balanceMicros = sum((account) => account.balanceMicros);
  const expectedMicros = baselineMicros + ledgerMicros;
  const scalar = (sql: string) =>
    Number(
      (database.prepare(sql).get() as { total: number | null }).total ?? 0,
    );

  return {
    accounts,
    totals: {
      ledgerMicros,
      baselineMicros,
      balanceMicros,
      expectedMicros,
      differenceMicros: balanceMicros - expectedMicros,
      balanced: accounts.every((account) => account.balanced),
      usageDebitsMicros: scalar(
        `SELECT COALESCE(SUM(charged_micros), 0) AS total FROM usage_events
         WHERE charged_micros > 0`,
      ),
      topupMicros: scalar(
        `SELECT COALESCE(SUM(amount_micros), 0) AS total FROM topups
         WHERE status = 'paid'`,
      ),
      heldMicros: scalar(
        "SELECT COALESCE(SUM(hold_micros), 0) AS total FROM credit_holds",
      ),
      quarantinedMicros: scalar(
        `SELECT COALESCE(SUM(reserved), 0) AS total FROM quarantined_holds
         WHERE kind = 'credit' AND status = 'quarantined'`,
      ),
      adjustmentMicros: scalar(
        `SELECT COALESCE(SUM(amount_micros), 0) AS total FROM credit_ledger
         WHERE kind IN ('refund', 'adjustment')`,
      ),
    },
  };
}
