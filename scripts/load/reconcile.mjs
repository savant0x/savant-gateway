function rows(database, sql, ...params) {
  return database.prepare(sql).all(...params);
}

/**
 * Reconciliation is read from durable state, not from the client's response
 * counts. The client can only prove what it observed; this proves what the
 * gateway recorded and what remains reserved.
 */
export function reconcile(database) {
  const users = rows(
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
  const settlement = rows(
    database,
    `SELECT status, COUNT(*) AS total FROM settlements
     WHERE user_id LIKE 'load-%' GROUP BY status`,
  );
  const status = (name) =>
    Number(settlement.find((row) => row.status === name)?.total ?? 0);
  const usage = database
    .prepare(
      "SELECT COUNT(*) AS total FROM usage_events WHERE user_id LIKE 'load-%'",
    )
    .get().total;
  const billing = rows(
    database,
    `SELECT billing_source, COUNT(*) AS total FROM usage_events
     WHERE user_id LIKE 'load-%' GROUP BY billing_source`,
  );
  const usageStatus = rows(
    database,
    `SELECT status, COUNT(*) AS total FROM usage_events
     WHERE user_id LIKE 'load-%' GROUP BY status`,
  );
  const quarantinedRows = rows(
    database,
    `SELECT kind, status, COUNT(*) AS total FROM quarantined_holds
     WHERE user_id LIKE 'load-%' GROUP BY kind, status`,
  );
  const integrity = database.pragma("integrity_check", { simple: true });
  const ledgerDifference = users.reduce(
    (total, row) => total + Math.abs(row.credit_micros - row.ledger_micros),
    0,
  );
  const heldDifference = users.reduce(
    (total, row) =>
      total +
      Math.abs(
        row.held_micros - row.held_rows - row.quarantined_rows,
      ),
    0,
  );
  const negativeCredit = users.filter((row) => row.credit_micros < 0).length;
  const quarantineTotal = quarantinedRows
    .filter((row) => row.status === "quarantined")
    .reduce((total, row) => total + row.total, 0);

  return {
    users: users.map((row) => ({
      id: row.id,
      creditMicros: row.credit_micros,
      ledgerMicros: row.ledger_micros,
      heldMicros: row.held_micros,
      heldRows: row.held_rows,
      quarantinedRows: row.quarantined_rows,
    })),
    settlements: {
      admitted: status("admitted"),
      committed: status("committed"),
      quarantined: status("quarantined"),
    },
    usage: {
      total: usage,
      committedMismatch: status("committed") - usage,
      billingSources: Object.fromEntries(
        billing.map((row) => [row.billing_source, row.total]),
      ),
      statuses: Object.fromEntries(
        usageStatus.map((row) => [row.status, row.total]),
      ),
    },
    quarantined: {
      total: quarantineTotal,
      groups: quarantinedRows,
    },
    ledgerDifferenceMicros: ledgerDifference,
    heldDifferenceMicros: heldDifference,
    negativeCreditUsers: negativeCredit,
    integrity,
  };
}
