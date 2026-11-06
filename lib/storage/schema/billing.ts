import type { PostgresDatabase } from "../pg-adapter.ts";

import { ensureColumn } from "./columns.ts";

/**
 * Billing tables: settlements, plans, subscriptions, invoices, promo codes and
 * operator incidents. Ported from `lib/schema/*` for FID-085 step 2.
 *
 * This module must run after `catalogSchema`, because `plan_groups`,
 * `plan_models` and the subscription snapshots reference `model_groups(slug)`
 * and `models(id)`. PostgreSQL enforces foreign keys unconditionally, so the
 * referenced tables have to exist — unlike SQLite, where the pragma decided.
 */
export async function billingSchema(db: PostgresDatabase) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settlements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      api_key_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      provider_slug TEXT NOT NULL,
      billing_source TEXT NOT NULL,
      credit_hold_id TEXT,
      free_reservation_id TEXT,
      subscription_hold_id TEXT,
      estimated_micros BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'admitted',
      detail TEXT,
      created_at TEXT NOT NULL,
      settled_at TEXT
    );
    CREATE INDEX IF NOT EXISTS settlements_status_idx
      ON settlements(status, created_at);
    CREATE INDEX IF NOT EXISTS settlements_user_idx
      ON settlements(user_id, created_at);

    CREATE TABLE IF NOT EXISTS quarantined_holds (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      user_id TEXT NOT NULL,
      api_key_id TEXT,
      model_id TEXT,
      period_id TEXT,
      reserved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      expired_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'quarantined',
      released_at TEXT,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS quarantined_holds_status_idx
      ON quarantined_holds(status, expired_at);

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'archived')),
      price_micros BIGINT NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'usd',
      interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),
      included_weighted_tokens BIGINT NOT NULL DEFAULT 0,
      overage_mode TEXT NOT NULL DEFAULT 'block'
        CHECK (overage_mode IN ('block', 'credit')),
      overage_markup_bps INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS plans_name_key ON plans (lower(name));
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
      price_micros_snapshot BIGINT NOT NULL,
      currency_snapshot TEXT NOT NULL,
      interval_snapshot TEXT NOT NULL,
      included_weighted_tokens_snapshot BIGINT NOT NULL,
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
      included_weighted_tokens BIGINT NOT NULL,
      weighted_tokens_used BIGINT NOT NULL DEFAULT 0,
      weighted_tokens_held BIGINT NOT NULL DEFAULT 0,
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
      amount_micros BIGINT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS promo_codes (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      code_prefix TEXT NOT NULL,
      label TEXT NOT NULL,
      amount_micros BIGINT NOT NULL CHECK(amount_micros > 0),
      max_redemptions INTEGER NOT NULL CHECK(max_redemptions > 0),
      redeemed_count INTEGER NOT NULL DEFAULT 0 CHECK(redeemed_count >= 0),
      status TEXT NOT NULL DEFAULT 'active',
      starts_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS promo_codes_status_idx
      ON promo_codes(status, expires_at);

    CREATE TABLE IF NOT EXISTS promo_redemptions (
      id TEXT PRIMARY KEY,
      promo_code_id TEXT NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_micros BIGINT NOT NULL,
      ledger_id TEXT NOT NULL UNIQUE,
      redeemed_at TEXT NOT NULL,
      UNIQUE(promo_code_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS promo_redemptions_user_idx
      ON promo_redemptions(user_id, redeemed_at);

    CREATE TABLE IF NOT EXISTS operations_incidents (
      id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL UNIQUE,
      severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'resolved')),
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      acknowledged_at TEXT,
      resolved_at TEXT,
      delivery_kind TEXT NOT NULL DEFAULT 'alert'
        CHECK (delivery_kind IN ('alert', 'recovery')),
      delivery_state TEXT NOT NULL DEFAULT 'pending'
        CHECK (delivery_state IN ('unconfigured', 'pending', 'delivered', 'failed')),
      delivery_attempts INTEGER NOT NULL DEFAULT 0,
      last_delivery_at TEXT,
      next_attempt_at TEXT,
      last_delivery_error TEXT
    );
    CREATE INDEX IF NOT EXISTS operations_incidents_status_idx
      ON operations_incidents(status, severity, last_seen);
    CREATE INDEX IF NOT EXISTS operations_incidents_delivery_idx
      ON operations_incidents(delivery_state, next_attempt_at);
  `);

  // Billing events predate the claim state machine, so existing rows are treated
  // as processed rather than reprocessed.
  for (const [column, definition] of [
    ["status", "TEXT NOT NULL DEFAULT 'processed'"],
    ["attempts", "INTEGER NOT NULL DEFAULT 1"],
    ["livemode", "INTEGER"],
    ["claimed_at", "TEXT"],
    ["last_error", "TEXT"],
    ["claim_generation", "INTEGER NOT NULL DEFAULT 0"],
  ] as const) {
    await ensureColumn(db, "billing_events", column, definition);
  }

  for (const [column, definition] of [
    ["cached_input_tokens", "INTEGER"],
    ["cache_write_input_tokens", "INTEGER"],
    ["reasoning_output_tokens", "INTEGER"],
    ["usage_source", "TEXT"],
  ] as const) {
    await ensureColumn(db, "usage_events", column, definition);
  }

  await ensureColumn(db, "usage_events", "serving_upstream_id", "TEXT");

  for (const [column, definition] of [
    ["billing_source", "TEXT NOT NULL DEFAULT 'credit'"],
    ["subscription_id", "TEXT"],
    ["subscription_period_id", "TEXT"],
    ["included_weighted_tokens", "BIGINT NOT NULL DEFAULT 0"],
  ] as const) {
    await ensureColumn(db, "usage_events", column, definition);
  }

  // The claim index names two columns added above, so it cannot live with the
  // table script — PostgreSQL resolves index columns at creation time and fails
  // with 42703 otherwise. It sits here for the same reason it lived in
  // `performanceIndexSchema` on the SQLite side: the table has to exist first.
  await db.exec(`
    CREATE INDEX IF NOT EXISTS billing_events_status_claimed_idx
      ON billing_events(status, claimed_at);
  `);
}
