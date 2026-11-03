async function rows(database, sql) {
  return database.prepare(sql).all();
}

/**
 * Reconciliation is read from durable state, not from the client's response
 * counts. The client can only prove what it observed; this proves what the
 * gateway recorded and what remains reserved.
 *
 * PostgreSQL returns BIGINT aggregates as strings, so every money figure is
 * coerced once here. `PRAGMA integrity_check` does not exist; the equivalent
 * failure the gate cares about is a foreign key that was added but never
 * validated, which this counts.
 */
export async function reconcile(database) {
  const users = await rows(
    database,
    `SELECT u.id, u.credit_micros, u.held_micros,
       (SELECT COALESCE(SUM(amount_micros), 0) FROM credit_ledger l
        WHERE l.user_id = u.id) AS ledger_micros,
       (SELECT COALESCE(SUM(hold_micros), 0) FROM credit_holds h
        WHERE h.user_id = u.id) AS held_rows,
       (SELECT COALESCE(SUM(reserved), 0) FROM quarantined_holds q
        WHERE q.user_id = u.id AND q.status = 'quarantined') AS quarantined_rows
     FROM users u WHERE u.id LIKE 'load-%' ORDER BY u.id`,
  );
  const settlement = await rows(
    database,
    `SELECT status, COUNT(*) AS total FROM settlements
     WHERE user_id LIKE 'load-%' GROUP BY status`,
  );
  const status = (name) =>
    Number(settlement.find((row) => row.status === name)?.total ?? 0);
  const usageRow = await database
    .prepare(
      "SELECT COUNT(*) AS total FROM usage_events WHERE user_id LIKE 'load-%'",
    )
    .get();
  const billing = await rows(
    database,
    `SELECT billing_source, COUNT(*) AS total FROM usage_events
     WHERE user_id LIKE 'load-%' GROUP BY billing_source`,
  );
  const usageStatus = await rows(
    database,
    `SELECT status, COUNT(*) AS total FROM usage_events
     WHERE user_id LIKE 'load-%' GROUP BY status`,
  );
  const quarantinedRows = await rows(
    database,
    `SELECT kind, status, COUNT(*) AS total FROM quarantined_holds
     WHERE user_id LIKE 'load-%' GROUP BY kind, status`,
  );
  const invalidForeignKeys = await database
    .prepare(
      `SELECT COUNT(*) AS total FROM pg_constraint
        WHERE contype = 'f' AND NOT convalidated`,
    )
    .get();
  const ledgerDifference = users.reduce(
    (total, row) =>
      total +
      Math.abs(Number(row.credit_micros) - Number(row.ledger_micros)),
    0,
  );
  const heldDifference = users.reduce(
    (total, row) =>
      total +
      Math.abs(
        Number(row.held_micros) -
          Number(row.held_rows) -
          Number(row.quarantined_rows),
      ),
    0,
  );
  const negativeCredit = users.filter(
    (row) => Number(row.credit_micros) < 0,
  ).length;
  const quarantineTotal = quarantinedRows
    .filter((row) => row.status === "quarantined")
    .reduce((total, row) => total + Number(row.total), 0);
  const usageTotal = Number(usageRow?.total ?? 0);
  const unvalidated = Number(invalidForeignKeys?.total ?? 0);

  return {
    users: users.map((row) => ({
      id: row.id,
      creditMicros: Number(row.credit_micros),
      ledgerMicros: Number(row.ledger_micros),
      heldMicros: Number(row.held_micros),
      heldRows: Number(row.held_rows),
      quarantinedRows: Number(row.quarantined_rows),
    })),
    settlements: {
      admitted: status("admitted"),
      committed: status("committed"),
      quarantined: status("quarantined"),
    },
    usage: {
      total: usageTotal,
      committedMismatch: status("committed") - usageTotal,
      billingSources: Object.fromEntries(
        billing.map((row) => [row.billing_source, Number(row.total)]),
      ),
      statuses: Object.fromEntries(
        usageStatus.map((row) => [row.status, Number(row.total)]),
      ),
    },
    quarantined: {
      total: quarantineTotal,
      groups: quarantinedRows.map((row) => ({
        ...row,
        total: Number(row.total),
      })),
    },
    ledgerDifferenceMicros: ledgerDifference,
    heldDifferenceMicros: heldDifference,
    negativeCreditUsers: negativeCredit,
    integrity:
      unvalidated === 0 ? "ok" : `${unvalidated} unvalidated foreign key(s)`,
  };
}
