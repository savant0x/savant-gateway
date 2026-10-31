/** Shared SQL fragments for model reads; one truth for the projection. */
export const MODEL_SELECT = `
  SELECT m.*, g.label AS group_label, g.billing_mode AS group_billing_mode
  FROM models m
  LEFT JOIN model_groups g ON g.slug = m.group_slug
`;

/**
 * How long a manually entered upstream cost stays trusted. Providers that
 * publish no machine-readable price list (Apixo today) have no drift signal, so
 * the operator's number is only as good as its age. `0` keeps it published
 * indefinitely; a malformed value keeps the 30-day default rather than
 * disabling the guard.
 */
export function priceMaxAgeDays(value: string | undefined) {
  const days = Number(value);

  return Number.isFinite(days) && days >= 0 ? days : 30;
}

export const PRICE_MAX_AGE_DAYS = priceMaxAgeDays(
  process.env.PROVIDER_PRICE_MAX_AGE_DAYS,
);

const manualCostFresh =
  PRICE_MAX_AGE_DAYS > 0
    ? `AND (
         m.cost_source <> 'manual'
         OR m.cost_observed_at IS NULL
         OR julianday(m.cost_observed_at) >=
            julianday('now', '-${PRICE_MAX_AGE_DAYS} days')
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
 * Shared by the catalog projection and the public counts so both tell the same
 * story; the admin surfaces never use it.
 */
export const PUBLIC_MODEL_SCOPE = `m.in_catalog = 1 AND m.status = 'active'
       AND m.is_primary = 1
       AND COALESCE(g.hidden, 0) = 0
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
