import {
  PRICE_MAX_AGE_DAYS,
  priceMaxAgeDays,
} from "../../providers/eligibility.ts";

/**
 * Shared SQL fragments for model reads, in PostgreSQL dialect (FID-085 step 4).
 *
 * One statement differs materially from the SQLite original. The manual-cost
 * freshness guard used `julianday(col) >= julianday('now', '-N days')`, which
 * PostgreSQL does not have. It becomes an explicit cast plus an interval:
 *
 *   m.cost_observed_at::timestamptz >= now() - interval 'N days'
 *
 * `cost_observed_at` is stored as ISO-8601 text (decision D-13), so the cast is
 * what gives it time semantics instead of lexical order. `N` is interpolated
 * rather than parameterised because it comes from a validated integer at module
 * load and never from a request.
 */

export { PRICE_MAX_AGE_DAYS, priceMaxAgeDays };

/**
 * The read projection includes the effective route's review state. A published
 * row can be served by another provider, so the gateway must ask about
 * `COALESCE(served_provider_slug, upstream_slug)` rather than the published
 * row's own provider. The scalar subqueries keep every existing `FROM models m`
 * caller working without adding joins it does not need.
 */
export const MODEL_SELECT = `
  SELECT m.*, g.label AS group_label, g.billing_mode AS group_billing_mode,
         COALESCE((
           SELECT rp.requires_model_review FROM providers rp
            WHERE rp.slug = COALESCE(m.served_provider_slug, m.upstream_slug)
         ), 0) AS served_requires_model_review,
         (
           SELECT re.decision FROM model_eligibility re
            WHERE re.provider_slug = COALESCE(m.served_provider_slug, m.upstream_slug)
              AND re.upstream_id = COALESCE(m.served_upstream_id, m.upstream_id)
         ) AS served_eligibility_decision,
         COALESCE((
           SELECT sr.cost_source FROM models sr
            WHERE sr.upstream_slug = COALESCE(m.served_provider_slug, m.upstream_slug)
              AND sr.upstream_id = COALESCE(m.served_upstream_id, m.upstream_id)
         ), m.cost_source) AS served_cost_source,
         (
           SELECT sr.cost_observed_at FROM models sr
            WHERE sr.upstream_slug = COALESCE(m.served_provider_slug, m.upstream_slug)
              AND sr.upstream_id = COALESCE(m.served_upstream_id, m.upstream_id)
         ) AS served_cost_observed_at
  FROM models m
  LEFT JOIN model_groups g ON g.slug = m.group_slug
`;

const manualCostFresh =
  PRICE_MAX_AGE_DAYS > 0
    ? `AND (
         m.cost_source <> 'manual'
         OR m.cost_observed_at IS NULL
         OR m.cost_observed_at::timestamptz >= now() - interval '${PRICE_MAX_AGE_DAYS} days'
       )`
    : "";

/**
 * The review-required route must be reviewed and priced on the route that
 * actually serves it. The served cost columns are the reconciliation snapshot;
 * the observation time is read from the serving row because it is not copied
 * into the snapshot. A missing or stale manual cost closes the row, as it does
 * for the published row.
 */
const reviewRouteFresh =
  PRICE_MAX_AGE_DAYS > 0
    ? `AND NOT EXISTS (
         SELECT 1 FROM models sm
          WHERE sm.upstream_slug = COALESCE(m.served_provider_slug, m.upstream_slug)
            AND sm.upstream_id = COALESCE(m.served_upstream_id, m.upstream_id)
            AND sm.cost_source = 'manual'
            AND (
              sm.cost_observed_at IS NULL
              OR sm.cost_observed_at::timestamptz < now() - interval '${PRICE_MAX_AGE_DAYS} days'
            )
       )`
    : "";

/**
 * The predicate that decides what a customer may be shown.
 *
 * A row is public when it is active in the catalog, its group is not hidden,
 * `is_primary` marks it as the group's published row, and — for plan-gated rows
 * — an active plan actually covers the model. A tier with no plan to buy it is
 * not published, so the catalog never offers a model that would answer `403
 * subscription_required`.
 *
 * Two money guards sit on top. A paid row without a sell price would answer
 * `503 model_unpriced`, so it is never published, and a row priced from a
 * manually entered cost is withheld once that cost is older than
 * `PROVIDER_PRICE_MAX_AGE_DAYS` — crypto sales are not refundable, so a price
 * nobody has re-checked is not offered. Free and subscription modes are exempt:
 * their price is the group, not a per-token number.
 *
 * A review-required provider adds a capability and cost guard on the effective
 * route. Absence of a decision is `unknown` and is denied; an explicit `chat`
 * decision plus positive input/output costs and positive sell prices is
 * required before a paid row can appear.
 */
export const PUBLIC_MODEL_SCOPE = `m.in_catalog = 1 AND m.status = 'active'
       AND m.is_primary = 1
       AND COALESCE(g.hidden, 0) = 0
       AND (
         COALESCE((
           SELECT rp.requires_model_review FROM providers rp
            WHERE rp.slug = COALESCE(m.served_provider_slug, m.upstream_slug)
         ), 0) = 0
         OR (
           EXISTS (
             SELECT 1 FROM model_eligibility re
              WHERE re.provider_slug = COALESCE(m.served_provider_slug, m.upstream_slug)
                AND re.upstream_id = COALESCE(m.served_upstream_id, m.upstream_id)
                AND re.decision = 'chat'
           )
           AND COALESCE(m.served_cost_input_micros, m.input_price_micros) > 0
           AND COALESCE(m.served_cost_output_micros, m.output_price_micros) > 0
           AND m.sell_input_micros > 0
           AND m.sell_output_micros > 0
           ${reviewRouteFresh}
         )
       )
       AND (
         COALESCE(g.billing_mode, 'paid') <> 'paid'
         OR m.sell_input_micros > 0
         OR m.sell_output_micros > 0
       )
       ${manualCostFresh}
       AND (
         COALESCE(g.billing_mode, 'paid') <> 'subscription'
         OR EXISTS (
           SELECT 1 FROM plans p
           JOIN plan_groups pg ON pg.plan_id = p.id
           WHERE p.status = 'active' AND pg.group_slug = m.group_slug
         )
         OR EXISTS (
           SELECT 1 FROM plans p
           JOIN plan_models pm ON pm.plan_id = p.id
           WHERE p.status = 'active' AND pm.model_id = m.id
         )
       )`;
