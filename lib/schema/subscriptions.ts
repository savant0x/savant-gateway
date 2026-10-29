import type { DatabaseHandle } from "./columns.ts";

import { ensureColumn } from "./columns.ts";

/**
 * Additive subscription schema. Plans are the authoring surface; each
 * subscription stores a snapshot so editing a plan cannot rewrite a purchase.
 */
export function subscriptionSchema(database: DatabaseHandle) {
  ensureColumn(database, "users", "stripe_customer_id", "TEXT");
  ensureColumn(
    database,
    "usage_events",
    "billing_source",
    "TEXT NOT NULL DEFAULT 'credit'",
  );
  ensureColumn(database, "usage_events", "subscription_id", "TEXT");
  ensureColumn(database, "usage_events", "subscription_period_id", "TEXT");
  ensureColumn(
    database,
    "usage_events",
    "included_weighted_tokens",
    "INTEGER NOT NULL DEFAULT 0",
  );

  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer_idx
      ON users(stripe_customer_id)
      WHERE stripe_customer_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'archived')),
      price_micros INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'usd',
      interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),
      included_weighted_tokens INTEGER NOT NULL DEFAULT 0,
      overage_mode TEXT NOT NULL DEFAULT 'block'
        CHECK (overage_mode IN ('block', 'credit')),
      overage_markup_bps INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS plans_status_idx
      ON plans(status, sort_order, name);

    CREATE TABLE IF NOT EXISTS plan_groups (
      plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      group_slug TEXT NOT NULL
        REFERENCES model_groups(slug) ON DELETE RESTRICT,
      PRIMARY KEY (plan_id, group_slug)
    );

    CREATE TABLE IF NOT EXISTS plan_models (
      plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
      PRIMARY KEY (plan_id, model_id)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
      status TEXT NOT NULL
        CHECK (status IN (
          'incomplete', 'active', 'past_due', 'canceled', 'expired'
        )),
      source TEXT NOT NULL DEFAULT 'stripe'
        CHECK (source IN ('stripe', 'manual')),
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT UNIQUE,
      plan_name_snapshot TEXT NOT NULL,
      price_micros_snapshot INTEGER NOT NULL,
      currency_snapshot TEXT NOT NULL,
      interval_snapshot TEXT NOT NULL,
      included_weighted_tokens_snapshot INTEGER NOT NULL,
      overage_mode_snapshot TEXT NOT NULL,
      overage_markup_bps_snapshot INTEGER NOT NULL,
      current_period_start TEXT NOT NULL,
      current_period_end TEXT NOT NULL,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS subscriptions_user_idx
      ON subscriptions(user_id, created_at);
    CREATE INDEX IF NOT EXISTS subscriptions_status_idx
      ON subscriptions(status, current_period_end);
    CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_active_user_idx
      ON subscriptions(user_id)
      WHERE status IN ('active', 'past_due');

    CREATE TABLE IF NOT EXISTS subscription_models (
      subscription_id TEXT NOT NULL
        REFERENCES subscriptions(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL,
      PRIMARY KEY (subscription_id, model_id)
    );

    CREATE TABLE IF NOT EXISTS subscription_periods (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL
        REFERENCES subscriptions(id) ON DELETE CASCADE,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      included_weighted_tokens INTEGER NOT NULL,
      weighted_tokens_used INTEGER NOT NULL DEFAULT 0,
      weighted_tokens_held INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'closed')),
      created_at TEXT NOT NULL,
      UNIQUE (subscription_id, period_start)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS subscription_periods_open_idx
      ON subscription_periods(subscription_id)
      WHERE status = 'open';

    CREATE TABLE IF NOT EXISTS subscription_holds (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL
        REFERENCES subscriptions(id) ON DELETE CASCADE,
      period_id TEXT NOT NULL
        REFERENCES subscription_periods(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
      model_id TEXT NOT NULL,
      weighted_tokens INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS subscription_holds_period_idx
      ON subscription_holds(period_id);
    CREATE INDEX IF NOT EXISTS subscription_holds_expiry_idx
      ON subscription_holds(expires_at);

    CREATE TABLE IF NOT EXISTS subscription_invoices (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL
        REFERENCES subscriptions(id) ON DELETE CASCADE,
      provider_invoice_id TEXT UNIQUE,
      amount_micros INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL
        CHECK (status IN ('paid', 'failed', 'open', 'void')),
      period_start TEXT,
      period_end TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS subscription_invoices_sub_idx
      ON subscription_invoices(subscription_id, created_at);
    CREATE INDEX IF NOT EXISTS subscription_invoices_status_idx
      ON subscription_invoices(status, paid_at);

    CREATE TABLE IF NOT EXISTS billing_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      processed_at TEXT NOT NULL
    );
  `);
}
