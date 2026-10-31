import type { DatabaseHandle } from "./columns.ts";

/**
 * A code is stored as a hash. The plaintext exists only in the creation
 * response; a database leak cannot be used to claim an unissued code.
 */
export function promoSchema(database: DatabaseHandle) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS promo_codes (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      code_prefix TEXT NOT NULL,
      label TEXT NOT NULL,
      amount_micros INTEGER NOT NULL CHECK(amount_micros > 0),
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
      amount_micros INTEGER NOT NULL,
      ledger_id TEXT NOT NULL UNIQUE,
      redeemed_at TEXT NOT NULL,
      UNIQUE(promo_code_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS promo_redemptions_user_idx
      ON promo_redemptions(user_id, redeemed_at);
  `);
}
