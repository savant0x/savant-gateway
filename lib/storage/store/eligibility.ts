import type { PostgresDatabase } from "../pg-adapter.ts";
import type {
  EligibilityDecision,
  ProviderReviewModel,
} from "../../providers/eligibility.ts";

import { reconcileRoutes } from "./routes.ts";

/**
 * Durable chat decisions for review-required providers.
 *
 * A decision is keyed by the exact provider and upstream model id, not by a
 * family or a price. It is never deleted by a sync or a delisting: the row
 * disappears from the catalog, but the operator's evidence survives for the day
 * the model returns. Absence means unknown, and unknown is denied.
 */

type ReviewRow = {
  id: string;
  upstream_id: string;
  name: string;
  status: string;
  in_catalog: number;
  cost_source: "synced" | "manual" | "unknown";
  cost_observed_at: string | null;
  input_price_micros: number | string;
  output_price_micros: number | string;
  sell_input_micros: number | string;
  sell_output_micros: number | string;
  decision: EligibilityDecision | null;
  source: string | null;
  observed_at: string | null;
  note: string | null;
};

export async function listProviderReviewModels(
  db: PostgresDatabase,
  providerSlug: string,
): Promise<ProviderReviewModel[]> {
  const rows = await db
    .prepare(
      `SELECT m.id, m.upstream_id, m.name, m.status, m.in_catalog,
              m.cost_source, m.cost_observed_at,
              m.input_price_micros, m.output_price_micros,
              m.sell_input_micros, m.sell_output_micros,
              e.decision, e.source, e.observed_at, e.note
         FROM models m
         LEFT JOIN model_eligibility e
           ON e.provider_slug = m.upstream_slug
          AND e.upstream_id = m.upstream_id
        WHERE m.upstream_slug = ?
        ORDER BY m.name ASC, m.upstream_id ASC`,
    )
    .all<ReviewRow>(providerSlug);

  return rows.map((row) => ({
    id: row.id,
    upstreamId: row.upstream_id,
    name: row.name,
    status: row.status,
    inCatalog: Number(row.in_catalog) === 1,
    costSource: row.cost_source,
    costObservedAt: row.cost_observed_at,
    costInputMicros: Number(row.input_price_micros),
    costOutputMicros: Number(row.output_price_micros),
    sellInputMicros: Number(row.sell_input_micros),
    sellOutputMicros: Number(row.sell_output_micros),
    decision: row.decision ?? null,
    source: row.source ?? null,
    observedAt: row.observed_at ?? null,
    note: row.note ?? null,
  }));
}

export type SetEligibilityResult =
  "ok" | "provider_not_found" | "model_not_found";

export type BulkEligibilityResult =
  "provider_not_found" | "empty" | { written: number; skipped: string[] };

/** The largest list one call may carry; the panel never approaches it. */
export const MAX_BULK_ELIGIBILITY = 1000;

/** Six parameters per row; 200 rows stays far below any driver limit. */
const BULK_ELIGIBILITY_CHUNK = 200;

/**
 * The same decision for many models, written once.
 *
 * A review-required provider publishes nothing until each model carries a dated
 * chat decision, and an imported catalog can be two hundred rows. Recording them
 * one request at a time is the operator's whole afternoon, so the write is batched
 * — but the evidence is unchanged: one row per model, the same source and date,
 * and the republish that follows it happens once.
 */
export async function setModelEligibilityBulk(
  db: PostgresDatabase,
  input: {
    providerSlug: string;
    upstreamIds: string[];
    decision: EligibilityDecision;
    source?: string;
    note?: string;
  },
  now = new Date().toISOString(),
): Promise<BulkEligibilityResult> {
  const requested = Array.from(
    new Set(input.upstreamIds.filter(Boolean)),
  ).slice(0, MAX_BULK_ELIGIBILITY);

  if (requested.length === 0) return "empty";

  const provider = await db
    .prepare("SELECT 1 FROM providers WHERE slug = ?")
    .get(input.providerSlug);

  if (!provider) return "provider_not_found";

  const placeholders = requested.map(() => "?").join(", ");
  const known = await db
    .prepare(
      `SELECT upstream_id FROM models
        WHERE upstream_slug = ? AND upstream_id IN (${placeholders})`,
    )
    .all<{ upstream_id: string }>(input.providerSlug, ...requested);
  const served = new Set(known.map((row) => row.upstream_id));
  const skipped = requested.filter((id) => !served.has(id));

  if (served.size === 0) return { written: 0, skipped };

  const source = input.source?.trim().slice(0, 80) || "operator";
  const note = input.note?.trim().slice(0, 500) || null;

  await db.transaction(async () => {
    // One multi-row upsert per 200 models instead of one statement per model
    // (FID-2026-1124-005). The conflict clause is unchanged, so re-deciding a
    // row still overwrites its evidence exactly as before.
    for (let start = 0; start < known.length; start += BULK_ELIGIBILITY_CHUNK) {
      const batch = known.slice(start, start + BULK_ELIGIBILITY_CHUNK);
      const tuples = batch.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
      const params = batch.flatMap((row) => [
        input.providerSlug,
        row.upstream_id,
        input.decision,
        source,
        now,
        note,
      ]);

      await db
        .prepare(
          `INSERT INTO model_eligibility
            (provider_slug, upstream_id, decision, source, observed_at, note)
           VALUES ${tuples}
           ON CONFLICT (provider_slug, upstream_id) DO UPDATE SET
             decision = excluded.decision,
             source = excluded.source,
             observed_at = excluded.observed_at,
             note = excluded.note`,
        )
        .run(...params);
    }
  })();

  await reconcileRoutes(db);

  return { written: known.length, skipped };
}

export async function setModelEligibility(
  db: PostgresDatabase,
  input: {
    providerSlug: string;
    upstreamId: string;
    decision: EligibilityDecision;
    source?: string;
    note?: string;
  },
  now = new Date().toISOString(),
): Promise<SetEligibilityResult> {
  const provider = await db
    .prepare("SELECT 1 FROM providers WHERE slug = ?")
    .get(input.providerSlug);

  if (!provider) return "provider_not_found";

  const model = await db
    .prepare("SELECT 1 FROM models WHERE upstream_slug = ? AND upstream_id = ?")
    .get(input.providerSlug, input.upstreamId);

  if (!model) return "model_not_found";

  const source = input.source?.trim().slice(0, 80) || "operator";
  const note = input.note?.trim().slice(0, 500) || null;

  await db
    .prepare(
      `INSERT INTO model_eligibility
        (provider_slug, upstream_id, decision, source, observed_at, note)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (provider_slug, upstream_id) DO UPDATE SET
         decision = excluded.decision,
         source = excluded.source,
         observed_at = excluded.observed_at,
         note = excluded.note`,
    )
    .run(
      input.providerSlug,
      input.upstreamId,
      input.decision,
      source,
      now,
      note,
    );

  // A decision changes publication and serving, so the group is republished
  // immediately rather than waiting for the next sync or price edit.
  await reconcileRoutes(db);

  return "ok";
}
