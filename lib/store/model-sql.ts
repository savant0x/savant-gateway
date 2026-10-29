/** Shared SQL fragments for model reads; one truth for the projection. */
export const MODEL_SELECT = `
  SELECT m.*, g.label AS group_label, g.billing_mode AS group_billing_mode
  FROM models m
  LEFT JOIN model_groups g ON g.slug = m.group_slug
`;

/**
 * The predicate that decides what a customer may be shown.
 *
 * A row is public when it is active in the catalog, its group is not hidden, and
 * — for plan-gated rows — an active plan actually covers the model. A tier with
 * no plan to buy it is not published, so the catalog never offers a model that
 * would answer `403 subscription_required`.
 *
 * Shared by the catalog projection and the public counts so both tell the same
 * story; the admin surfaces never use it.
 */
export const PUBLIC_MODEL_SCOPE = `m.in_catalog = 1 AND m.status = 'active'
       AND COALESCE(g.hidden, 0) = 0
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
