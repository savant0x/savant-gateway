import type { DatabaseHandle } from "./schema/columns.ts";
import type { ModelAccess, ModelRouteSummary } from "./types.ts";

import { routeGroupKey } from "./model-identity.ts";
import { pricesForGroup } from "./model-groups.ts";
import { planModelRoutes, type RouteCandidate } from "./model-routing.ts";
import { defaultSellMicros, microsToPrice } from "./pricing.ts";

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
};

const ROUTE_SELECT = `
  SELECT m.id, m.route_group, m.upstream_slug, m.upstream_id, m.protocol,
         m.input_price_micros, m.output_price_micros,
         m.sell_input_micros, m.sell_output_micros, m.price_source,
         m.allow_free, m.cost_source, m.status, m.in_catalog,
         COALESCE(g.billing_mode, 'paid') AS group_billing_mode,
         p.enabled AS provider_enabled, p.sort_order AS provider_sort_order
  FROM models m
  JOIN providers p ON p.slug = m.upstream_slug
  LEFT JOIN model_groups g ON g.slug = m.group_slug
`;

/** Every provider row for one route group, for the admin catalog. */
export function routesByGroup(
  rows: Array<{
    route_group: string | null;
    upstream_slug: string;
    upstream_id: string;
    input_price_micros: number;
    output_price_micros: number;
    is_primary: number;
    status: string;
    group_billing_mode?: ModelAccess | null;
  }>,
) {
  const map = new Map<string, ModelRouteSummary[]>();

  for (const row of rows) {
    const group = routeGroupKey({
      routeGroup: row.route_group,
      upstreamId: row.upstream_id,
      billingMode: row.group_billing_mode ?? "paid",
    });
    const list = map.get(group) ?? [];

    list.push({
      providerSlug: row.upstream_slug,
      upstreamId: row.upstream_id,
      costInputPer1M: microsToPrice(row.input_price_micros),
      costOutputPer1M: microsToPrice(row.output_price_micros),
      primary: row.is_primary === 1,
      status: row.status,
    });
    map.set(group, list);
  }

  return map;
}

function toCandidate(row: RouteRow): RouteCandidate {
  return {
    id: row.id,
    namespaced: row.id.startsWith(`${row.upstream_slug}/`),
    providerSlug: row.upstream_slug,
    upstreamId: row.upstream_id,
    protocol: row.protocol,
    costInputMicros: row.input_price_micros,
    costOutputMicros: row.output_price_micros,
    costSource: row.cost_source,
    allowFree: row.allow_free === 1,
    status: row.status,
    inCatalog: row.in_catalog === 1,
    providerEnabled: row.provider_enabled === 1,
    providerSortOrder: row.provider_sort_order,
    sellInputMicros: row.sell_input_micros,
    sellOutputMicros: row.sell_output_micros,
    groupBillingMode: row.group_billing_mode,
  };
}

/**
 * Recomputes, for every model group, which row is published and which provider
 * serves it. The cheapest servable route wins; the published id is the stable,
 * unscoped one. An auto-priced published row follows the serving cost, so a
 * cheaper upstream that undercuts the incumbent does not leave a stale sell
 * price behind.
 *
 * Takes the database handle and markup so the rules can be exercised against a
 * disposable schema; the caller owns the catalog cache.
 */
export function reconcileRoutesIn(database: DatabaseHandle, markupBps: number) {
  const rows = database.prepare(ROUTE_SELECT).all() as RouteRow[];
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

  const update = database.prepare(`
    UPDATE models
    SET is_primary = ?, served_provider_slug = ?, served_upstream_id = ?,
        served_protocol = ?, served_cost_input_micros = ?,
        served_cost_output_micros = ?
    WHERE id = ?
  `);
  const reprice = database.prepare(
    "UPDATE models SET sell_input_micros = ?, sell_output_micros = ? WHERE id = ?",
  );

  database
    .transaction(() => {
      for (const members of Array.from(groups.values())) {
        const plan = planModelRoutes(members.map(toCandidate));
        const serving =
          members.find((row) => row.id === plan.servingId) ?? null;

        for (const member of members) {
          const primary = member.id === plan.publishedId;

          // Only the published row carries the winning route. A pinned
          // `provider/model` id must answer from its own provider, so the other
          // rows keep a null served route and resolve to themselves.
          update.run(
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
          priced.sellInputMicros !== published.sell_input_micros ||
          priced.sellOutputMicros !== published.sell_output_micros
        ) {
          reprice.run(
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
