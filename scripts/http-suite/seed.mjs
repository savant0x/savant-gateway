const PROVIDER_KEY_ENV = "HTTP_SUITE_PROVIDER_KEY";

/**
 * Fixture seeding for the HTTP suite on PostgreSQL (FID-086, D-5).
 *
 * `INSERT OR REPLACE` is gone: the suite runs against a fresh database, so a
 * conflict means the fixture was seeded twice, and `DO NOTHING` keeps the first
 * row instead of rewriting a row a check may already hold.
 */

export async function seedCatalog(database, { mockBaseUrl }) {
  const now = new Date().toISOString();

  await database
    .prepare(
      `INSERT INTO providers
        (slug, label, kind, base_url, key_env_var, default_headers,
         supports_balance, supports_subscription, supports_pricing,
         enabled, sort_order, status, created_at, updated_at)
       VALUES ('mock', 'HTTP Suite Mock', 'openai', ?, ?, '{}',
         1, 0, 0, 1, 0, 'active', ?, ?)
       ON CONFLICT (slug) DO NOTHING`,
    )
    .run(mockBaseUrl, PROVIDER_KEY_ENV, now, now);

  await database
    .prepare(
      `INSERT INTO models
        (id, upstream_id, name, provider, context_window, token_weight,
         input_price_micros, output_price_micros, allow_free,
         supports_tools, supports_vision, status, sort_order, synced_at,
         upstream_slug, family, protocol, cost_source,
         sell_input_micros, sell_output_micros, price_source, in_catalog,
         group_slug, group_source)
       VALUES ('mock-paid', 'mock-upstream-model', 'HTTP Suite Paid Model',
         'Mock', '128000', 1, 500000, 1000000, 0, 0, 0, 'active', 0, ?,
         'mock', 'Mock', 'chat', 'manual', 1000000, 2000000, 'manual', 1,
         'paid', 'manual')
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(now);

  // The free SKU the allocation panel is checked against (FID-149). It lives
  // under its own provider so the mock provider's catalog-sync checks still
  // observe exactly the one row their upstream publishes.
  await database
    .prepare(
      `INSERT INTO providers
        (slug, label, kind, base_url, key_env_var, default_headers,
         supports_balance, supports_subscription, supports_pricing,
         enabled, sort_order, status, created_at, updated_at)
       VALUES ('alloc', 'HTTP Suite Allocation', 'openai', ?, ?, '{}',
         0, 0, 0, 1, 5, 'active', ?, ?)
       ON CONFLICT (slug) DO NOTHING`,
    )
    .run(mockBaseUrl, PROVIDER_KEY_ENV, now, now);

  await database
    .prepare(
      `INSERT INTO models
        (id, upstream_id, name, provider, context_window, token_weight,
         input_price_micros, output_price_micros, allow_free,
         supports_tools, supports_vision, status, sort_order, synced_at,
         upstream_slug, family, protocol, cost_source,
         sell_input_micros, sell_output_micros, price_source, in_catalog,
         group_slug, group_source)
       VALUES ('free/mock-free', 'mock-upstream-free', 'HTTP Suite Free Model',
         'Mock', '128000', 2, 0, 0, 1, 0, 0, 'active', 0, ?,
         'alloc', 'Mock', 'chat', 'manual', 0, 0, 'manual', 1,
         'free', 'manual')
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(now);
}

export async function seedPendingTopup(database, input) {
  const now = new Date().toISOString();

  await database
    .prepare(
      `INSERT INTO topups
        (id, user_id, provider, provider_ref, amount_micros, currency, status,
         created_at, paid_at)
       VALUES (?, ?, ?, ?, ?, 'usd', 'pending', ?, NULL)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(
      input.id,
      input.userId,
      input.provider ?? "stripe",
      input.providerRef,
      input.amountMicros,
      now,
    );
}

export async function readUsageRows(database, userId) {
  return database
    .prepare(
      `SELECT model_id, input_tokens, output_tokens,
              charged_micros::int AS charged_micros,
              cost_micros::int AS cost_micros, status, billing_source, error
       FROM usage_events
       WHERE user_id = ?
       ORDER BY created_at::timestamptz DESC`,
    )
    .all(userId);
}

export async function readLatestErrorRow(database, userId) {
  return database
    .prepare(
      `SELECT status, error FROM usage_events
       WHERE user_id = ? AND status = 'error'
       ORDER BY ctid DESC LIMIT 1`,
    )
    .get(userId);
}

export async function countPaidTopups(database, userId) {
  const row = await database
    .prepare(
      `SELECT COUNT(*)::int AS total FROM topups
       WHERE user_id = ? AND status = 'paid'`,
    )
    .get(userId);

  return row.total;
}

export async function countTopupLedger(database, userId) {
  const row = await database
    .prepare(
      `SELECT COUNT(*)::int AS total FROM credit_ledger
       WHERE user_id = ? AND kind = 'topup'`,
    )
    .get(userId);

  return row.total;
}

export async function getTopupStatus(database, topupId) {
  const row = await database
    .prepare("SELECT status FROM topups WHERE id = ?")
    .get(topupId);

  return row?.status ?? null;
}
