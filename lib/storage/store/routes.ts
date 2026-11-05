import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ModelAccess } from "../../types.ts";
import type { EligibilityDecision } from "../../providers/eligibility.ts";

import { routeGroupKey } from "../../model-identity.ts";
import { pricesForGroup } from "../../model-groups.ts";
import { planModelRoutes, type RouteCandidate } from "../../model-routing.ts";
import { defaultSellMicros } from "../../pricing.ts";

import { clearPublicCatalogCache } from "./catalog.ts";
import { getMarkupBps } from "./settings.ts";

/**
 * Route reconciliation, ported to the async handle (FID-085 step 4).
 *
 * `routesByGroup` is re-exported from `lib/route-reconcile.ts` rather than
 * rewritten: it is a pure grouping over rows the caller already read, with no
 * handle involved, so there is nothing about it the port needs to change and
 * nothing to gain from a second copy.
 *
 * The reconciliation itself is the same rule as before — cheapest servable
 * route wins, the published id stays stable, and an auto-priced published row
 * follows the serving cost so a new cheaper provider does not leave a stale
 * sell price behind. Only the loop became asynchronous.
 */

export { routesByGroup } from "../../route-reconcile.ts";

type RouteRow = {
  id: string;
  route_group: string | null;
  upstream_slug: string;
  upstream_id: string;
  protocol: "chat" | "messages";
  input_price_micros: number;
  output_price_micros: number;
  sell_input_micros: number;
  sell_output_micros: number;
  price_source: "auto" | "manual";
  allow_free: number;
  cost_source: "synced" | "manual" | "unknown";
  status: string;
  in_catalog: number;
  group_billing_mode: ModelAccess;
  provider_enabled: number;
  provider_sort_order: number;
  requires_model_review: number;
  eligibility_decision: EligibilityDecision | null;
  cost_observed_at: string | null;
};

const ROUTE_SELECT = `
  SELECT m.id, m.route_group, m.upstream_slug, m.upstream_id, m.protocol,
         m.input_price_micros, m.output_price_micros,
         m.sell_input_micros, m.sell_output_micros, m.price_source,
         m.allow_free, m.cost_source, m.status, m.in_catalog,
         COALESCE(g.billing_mode, 'paid') AS group_billing_mode,
         p.enabled AS provider_enabled, p.sort_order AS provider_sort_order,
         p.requires_model_review, me.decision AS eligibility_decision,
         m.cost_observed_at
  FROM models m
  JOIN providers p ON p.slug = m.upstream_slug
  LEFT JOIN model_eligibility me
    ON me.provider_slug = m.upstream_slug
   AND me.upstream_id = m.upstream_id
  LEFT JOIN model_groups g ON g.slug = m.group_slug
`;

function toCandidate(row: RouteRow): RouteCandidate {
  return {
    id: row.id,
    namespaced: row.id.startsWith(`${row.upstream_slug}/`),
    providerSlug: row.upstream_slug,
    upstreamId: row.upstream_id,
    protocol: row.protocol,
    costInputMicros: Number(row.input_price_micros),
    costOutputMicros: Number(row.output_price_micros),
    costSource: row.cost_source,
    allowFree: row.allow_free === 1,
    status: row.status,
    inCatalog: row.in_catalog === 1,
    providerEnabled: row.provider_enabled === 1,
    providerSortOrder: row.provider_sort_order,
    sellInputMicros: Number(row.sell_input_micros),
    sellOutputMicros: Number(row.sell_output_micros),
    groupBillingMode: row.group_billing_mode,
    requiresReview: Number(row.requires_model_review) === 1,
    decision: row.eligibility_decision ?? null,
    costObservedAt: row.cost_observed_at,
  };
}

export async function reconcileRoutesIn(
  db: PostgresDatabase,
  markupBps: number,
) {
  const rows = await db.prepare(ROUTE_SELECT).all<RouteRow>();
  const groups = new Map<string, RouteRow[]>();

  for (const row of rows) {
    const group = routeGroupKey({
      routeGroup: row.route_group,
      upstreamId: row.upstream_id,
      billingMode: row.group_billing_mode,
    });
    const members = groups.get(group);

    if (members) members.push(row);
    else groups.set(group, [row]);
  }

  const update = db.prepare(`
    UPDATE models
    SET is_primary = ?, served_provider_slug = ?, served_upstream_id = ?,
        served_protocol = ?, served_cost_input_micros = ?,
        served_cost_output_micros = ?
    WHERE id = ?
  `);
  const reprice = db.prepare(
    "UPDATE models SET sell_input_micros = ?, sell_output_micros = ? WHERE id = ?",
  );

  await db
    .transaction(async () => {
      for (const members of Array.from(groups.values())) {
        const plan = planModelRoutes(members.map(toCandidate));
        const serving =
          members.find((row) => row.id === plan.servingId) ?? null;

        for (const member of members) {
          const primary = member.id === plan.publishedId;

          // Only the published row carries the winning route. A pinned
          // `provider/model` id must answer from its own provider, so the other
          // rows keep a null served route and resolve to themselves.
          await update.run(
            primary ? 1 : 0,
            primary ? (serving?.upstream_slug ?? null) : null,
            primary ? (serving?.upstream_id ?? null) : null,
            primary ? (serving?.protocol ?? null) : null,
            primary ? (serving?.input_price_micros ?? null) : null,
            primary ? (serving?.output_price_micros ?? null) : null,
            member.id,
          );
        }

        const published = members.find((row) => row.id === plan.publishedId);

        if (!published || !serving || published.price_source !== "auto")
          continue;

        const priced = pricesForGroup({
          billingMode: published.group_billing_mode,
          sellInputMicros: defaultSellMicros(
            serving.input_price_micros,
            markupBps,
          ),
          sellOutputMicros: defaultSellMicros(
            serving.output_price_micros,
            markupBps,
          ),
        });

        if (
          priced.sellInputMicros !== Number(published.sell_input_micros) ||
          priced.sellOutputMicros !== Number(published.sell_output_micros)
        ) {
          await reprice.run(
            priced.sellInputMicros,
            priced.sellOutputMicros,
            published.id,
          );
        }
      }
    })
    .immediate();

  return rows.length;
}

/** Reconciles the live catalog and invalidates the published projection. */
export async function reconcileRoutes(db: PostgresDatabase) {
  const reconciled = await reconcileRoutesIn(db, await getMarkupBps(db));

  clearPublicCatalogCache(db);

  return reconciled;
}
