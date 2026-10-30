const PROVIDER_KEY_ENV = "HTTP_SUITE_PROVIDER_KEY";

export function seedCatalog(database, { mockBaseUrl }) {
  const now = new Date().toISOString();

  database
    .prepare(
      `INSERT OR REPLACE INTO providers
        (slug, label, kind, base_url, key_env_var, default_headers,
         supports_balance, supports_subscription, supports_pricing,
         enabled, sort_order, status, created_at, updated_at)
       VALUES ('mock', 'HTTP Suite Mock', 'openai', ?, ?, '{}',
         0, 0, 0, 1, 0, 'active', ?, ?)`,
    )
    .run(mockBaseUrl, PROVIDER_KEY_ENV, now, now);

  database
    .prepare(
      `INSERT OR REPLACE INTO models
        (id, upstream_id, name, provider, context_window, token_weight,
         input_price_micros, output_price_micros, allow_free,
         supports_tools, supports_vision, status, sort_order, synced_at,
         upstream_slug, family, protocol, cost_source,
         sell_input_micros, sell_output_micros, price_source, in_catalog,
         group_slug, group_source)
       VALUES ('mock-paid', 'mock-upstream-model', 'HTTP Suite Paid Model',
         'Mock', '128000', 1, 500000, 1000000, 0, 0, 0, 'active', 0, ?,
         'mock', 'Mock', 'chat', 'manual', 1000000, 2000000, 'manual', 1,
         'paid', 'manual')`,
    )
    .run(now);
}

export function seedPendingTopup(database, input) {
  const now = new Date().toISOString();

  database
    .prepare(
      `INSERT OR REPLACE INTO topups
        (id, user_id, provider, provider_ref, amount_micros, currency, status,
         created_at, paid_at)
       VALUES (?, ?, 'stripe', ?, ?, 'usd', 'pending', ?, NULL)`,
    )
    .run(input.id, input.userId, input.providerRef, input.amountMicros, now);
}

export function readUsageRows(database, userId) {
  return database
    .prepare(
      `SELECT model_id, input_tokens, output_tokens, charged_micros,
              cost_micros, status, billing_source, error
       FROM usage_events
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC`,
    )
    .all(userId);
}

export function readLatestErrorRow(database, userId) {
  return database
    .prepare(
      `SELECT status, error FROM usage_events
       WHERE user_id = ? AND status = 'error'
       ORDER BY rowid DESC LIMIT 1`,
    )
    .get(userId);
}

export function countPaidTopups(database, userId) {
  const row = database
    .prepare(
      `SELECT COUNT(*) AS total FROM topups
       WHERE user_id = ? AND status = 'paid'`,
    )
    .get(userId);

  return row.total;
}

export function countTopupLedger(database, userId) {
  const row = database
    .prepare(
      `SELECT COUNT(*) AS total FROM credit_ledger
       WHERE user_id = ? AND kind = 'topup'`,
    )
    .get(userId);

  return row.total;
}

export function getTopupStatus(database, topupId) {
  const row = database
    .prepare("SELECT status FROM topups WHERE id = ?")
    .get(topupId);

  return row?.status ?? null;
}
