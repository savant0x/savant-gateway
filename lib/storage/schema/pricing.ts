import type { PostgresDatabase } from "../pg-adapter.ts";

/**
 * Pricing decision audit (FID-2026-1103-141).
 *
 * A price approval is a financial act, but the admin credential is shared: there
 * is no individual operator identity to record. The row therefore keeps what can
 * be known honestly — the model, the cost basis, before/after prices, the target
 * margin, the reason, the recommendation payload and the effective time — and
 * labels the actor as the admin session rather than inventing a person.
 *
 * `model_id` deliberately has no foreign key. Deleting a provider removes its
 * catalog rows; the price history that explains a past charge must survive that
 * deletion. `model_name` is a snapshot for the same reason.
 */
export async function pricingSchema(db: PostgresDatabase) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS pricing_decisions (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      actor TEXT NOT NULL,
      reason TEXT NOT NULL,
      cost_source TEXT NOT NULL,
      cost_input_micros BIGINT NOT NULL,
      cost_output_micros BIGINT NOT NULL,
      before_input_micros BIGINT NOT NULL,
      before_output_micros BIGINT NOT NULL,
      after_input_micros BIGINT NOT NULL,
      after_output_micros BIGINT NOT NULL,
      target_margin_bps INTEGER,
      rounding TEXT,
      recommendation_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pricing_decisions_model_idx
      ON pricing_decisions(model_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS pricing_decisions_created_idx
      ON pricing_decisions(created_at DESC);
  `);
}
