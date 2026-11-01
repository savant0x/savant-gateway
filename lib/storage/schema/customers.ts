import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Customer-facing tables: sessions, top-ups, account actions, lifecycle events,
 * policy acceptance, support, trials and the free-pool allocation ledger.
 * Ported from `lib/db.ts` and `lib/schema/*` for FID-085 step 2.
 *
 * `free_pool_usage` and `free_pool_reservations` carry `provider_slug`, which
 * the provider module adds to SQLite through a guarded ALTER. Here it is part of
 * the table definition: there is no legacy PostgreSQL database to stay
 * compatible with.
 */
export async function customerSchema(db: PostgresDatabase) {
  await db.exec(`
    CREATE INDEX IF NOT EXISTS usage_events_user_idx
      ON usage_events(user_id, created_at);

    CREATE TABLE IF NOT EXISTS customer_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS customer_sessions_user_idx
      ON customer_sessions(user_id, expires_at);

    CREATE TABLE IF NOT EXISTS topups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'stripe',
      provider_ref TEXT NOT NULL UNIQUE,
      amount_micros BIGINT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      paid_at TEXT
    );
    CREATE INDEX IF NOT EXISTS topups_user_idx ON topups(user_id, created_at);
    CREATE INDEX IF NOT EXISTS topups_status_idx ON topups(status, created_at);

    CREATE TABLE IF NOT EXISTS free_pool_usage (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      weighted_tokens BIGINT NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, day)
    );

    CREATE TABLE IF NOT EXISTS free_pool_reservations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
      model_id TEXT NOT NULL,
      day TEXT NOT NULL,
      weighted_tokens INTEGER NOT NULL,
      provider_slug TEXT NOT NULL DEFAULT 'savant',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS free_pool_reservations_user_idx
      ON free_pool_reservations(user_id, day);
    CREATE INDEX IF NOT EXISTS free_pool_reservations_expiry_idx
      ON free_pool_reservations(expires_at);

    CREATE TABLE IF NOT EXISTS free_pool_allocations (
      day TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      allocated_tokens BIGINT NOT NULL CHECK (allocated_tokens >= 0),
      created_at TEXT NOT NULL,
      PRIMARY KEY (day, user_id)
    );
    CREATE INDEX IF NOT EXISTS free_pool_allocations_day_idx
      ON free_pool_allocations(day);

    CREATE TABLE IF NOT EXISTS account_actions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
      token_hash TEXT NOT NULL UNIQUE,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      consumed_at BIGINT,
      delivery_state TEXT NOT NULL DEFAULT 'pending'
        CHECK (delivery_state IN ('pending', 'sent', 'failed'))
    );
    CREATE INDEX IF NOT EXISTS account_actions_user_idx
      ON account_actions(user_id, purpose, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS account_actions_active_idx
      ON account_actions(user_id, purpose) WHERE consumed_at IS NULL;

    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      actor TEXT NOT NULL DEFAULT 'system',
      kind TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS activity_events_user_idx
      ON activity_events(user_id, created_at);
    CREATE INDEX IF NOT EXISTS activity_events_kind_idx
      ON activity_events(kind, created_at);

    CREATE TABLE IF NOT EXISTS policy_acceptances (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      version TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('signup', 'account')),
      accepted_at TEXT NOT NULL,
      UNIQUE (user_id, version)
    );
    CREATE INDEX IF NOT EXISTS policy_acceptances_version_idx
      ON policy_acceptances(version, accepted_at);

    CREATE TABLE IF NOT EXISTS support_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'resolved')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      resolution_note TEXT
    );
    CREATE INDEX IF NOT EXISTS support_requests_user_idx
      ON support_requests(user_id, created_at);
    CREATE INDEX IF NOT EXISTS support_requests_status_idx
      ON support_requests(status, created_at);

    CREATE TABLE IF NOT EXISTS trial_grants (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      granted_tokens BIGINT NOT NULL CHECK(granted_tokens >= 0),
      used_tokens BIGINT NOT NULL DEFAULT 0 CHECK(used_tokens >= 0),
      issued_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trial_reservations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES trial_grants(user_id) ON DELETE CASCADE,
      reserved_tokens INTEGER NOT NULL CHECK(reserved_tokens >= 0),
      actual_tokens INTEGER,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      settled_at TEXT
    );
    CREATE INDEX IF NOT EXISTS trial_reservations_user_idx
      ON trial_reservations(user_id, settled_at, expires_at);
  `);
}
