import type { ModelAccess } from "./types.ts";

/**
 * Route planning for one model that one or more providers offer.
 *
 * The published id is stable: the row whose id is not namespaced keeps its id
 * even when a different provider serves it, so a customer's configured model
 * string never changes when a cheaper upstream appears. Serving is chosen by
 * cost, and only a row that can actually complete a billed call is a candidate.
 *
 * The operator's disable is a master switch on the published row: a disabled
 * published row hides the whole group rather than silently promoting another
 * provider under a name the operator took down.
 */
export type RouteCandidate = {
  id: string;
  namespaced: boolean;
  providerSlug: string;
  upstreamId: string;
  protocol: "chat" | "messages";
  costInputMicros: number;
  costOutputMicros: number;
  costSource: "synced" | "manual" | "unknown";
  allowFree: boolean;
  status: string;
  inCatalog: boolean;
  providerEnabled: boolean;
  providerSortOrder: number;
  sellInputMicros: number;
  sellOutputMicros: number;
  groupBillingMode: ModelAccess;
};

export type RoutePlan = {
  /** The id the public catalog keeps for this model. */
  publishedId: string | null;
  /** The row that serves it; null when nothing can serve it. */
  servingId: string | null;
  /** Servable rows, cheapest first. */
  ranking: string[];
};

/** 3 input tokens to 1 output token, the blend this repo uses for comparisons. */
export function routeCostMicros(input: {
  costInputMicros: number;
  costOutputMicros: number;
}) {
  return (
    3 * Math.max(0, input.costInputMicros) + Math.max(0, input.costOutputMicros)
  );
}

export function isServableRoute(row: RouteCandidate) {
  if (!row.providerEnabled || row.status !== "active" || !row.inCatalog) {
    return false;
  }

  // A free-pool row is priced by its group, not by a per-token cost.
  if (!row.allowFree && row.costSource === "unknown") return false;

  // A non-free row with no sell price answers `503 model_unpriced`; publishing
  // it and then routing to it would be a promise the gateway does not keep.
  return (
    row.groupBillingMode === "free" ||
    row.sellInputMicros > 0 ||
    row.sellOutputMicros > 0
  );
}

function compareRoutes(a: RouteCandidate, b: RouteCandidate) {
  return (
    routeCostMicros(a) - routeCostMicros(b) ||
    a.costInputMicros - b.costInputMicros ||
    a.providerSortOrder - b.providerSortOrder ||
    a.id.localeCompare(b.id)
  );
}

export function planModelRoutes(rows: RouteCandidate[]): RoutePlan {
  if (rows.length === 0) {
    return { publishedId: null, servingId: null, ranking: [] };
  }

  const ordered = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const servable = ordered.filter(isServableRoute).sort(compareRoutes);
  const winner = servable[0] ?? null;
  // The stable name belongs to the unscoped row. Falling back to the winner is
  // how a model that exists only on a secondary provider gets published.
  const published =
    ordered.find((row) => !row.namespaced && row.inCatalog) ??
    ordered.find((row) => !row.namespaced) ??
    winner ??
    ordered[0];
  const serveablePublished =
    published.status === "active" && published.inCatalog;

  return {
    publishedId: published.id,
    servingId: serveablePublished ? (winner?.id ?? null) : null,
    ranking: servable.map((row) => row.id),
  };
}
