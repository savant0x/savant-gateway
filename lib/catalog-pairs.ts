import type { ModelAccess, ModelSummary } from "./types.ts";

import { canonicalModelKey } from "./model-identity.ts";

/**
 * One catalog row per model, not per published id.
 *
 * A provider may publish the same weights twice — a `free/` allocation and the
 * metered id — and the catalog used to list them as two unrelated rows. They
 * are the same model with two purchase paths, so the public table shows one
 * row and offers both: the free tier and the paid rate. Model identity is the
 * same key routing uses, so the projection cannot invent a pairing that the
 * gateway would not honour.
 *
 * This is presentation only. `/v1/models` keeps every published id, because a
 * request body has to name exactly one.
 */
export type PairedCatalogModel = {
  /** Provider-neutral model identity, shared by every variant. */
  key: string;
  /** The variant that names the row and links to the detail page. */
  display: ModelSummary;
  /** The variant whose price and benchmark the row shows. */
  primary: ModelSummary;
  free: ModelSummary | null;
  paid: ModelSummary | null;
  subscription: ModelSummary[];
  variants: ModelSummary[];
};

/** Paid first: the row is titled by the version most customers buy. */
const DISPLAY_RANK: Record<ModelAccess, number> = {
  paid: 0,
  subscription: 1,
  free: 2,
};

export function pairCatalogModels(
  models: ModelSummary[],
): PairedCatalogModel[] {
  const groups = new Map<string, ModelSummary[]>();

  for (const model of models) {
    // `upstreamId` and `id` agree for the default provider; a namespaced
    // provider id must pair with its own upstream identity, not with the
    // namespace prefix.
    const key = canonicalModelKey(model.upstreamId || model.id);
    const members = groups.get(key);

    if (members) members.push(model);
    else groups.set(key, [model]);
  }

  return Array.from(groups, ([key, members]) => {
    const variants = [...members].sort(
      (left, right) =>
        DISPLAY_RANK[left.access] - DISPLAY_RANK[right.access] ||
        left.id.localeCompare(right.id),
    );
    const paid = variants.find((model) => model.access === "paid") ?? null;

    return {
      key,
      display: variants[0],
      primary: paid ?? variants[0],
      free: variants.find((model) => model.access === "free") ?? null,
      paid,
      subscription: variants.filter((model) => model.access === "subscription"),
      variants,
    };
  });
}

export type CatalogAccessPath = {
  access: ModelAccess;
  label: string;
  href: string;
  /** Why this path exists, for the link's title. */
  detail: string;
};

/**
 * The purchase paths a row offers. Every href is a route that already knows the
 * customer's balance and plan state, so the catalog never invents a checkout.
 */
export function catalogAccessPaths(
  row: PairedCatalogModel,
): CatalogAccessPath[] {
  const paths: CatalogAccessPath[] = [];

  if (row.free) {
    paths.push({
      access: "free",
      label: "Free tier",
      href: "/dashboard",
      detail:
        "Free access draws on a daily weighted-token allowance and shared upstream capacity. Open the console for a key.",
    });
  }

  if (row.paid) {
    paths.push({
      access: "paid",
      label: "Buy credit",
      href: "/account",
      detail: "Prepaid credit, settled at the published per-token rate.",
    });
  }

  if (row.subscription.length > 0) {
    paths.push({
      access: "subscription",
      label: "See plans",
      href: "/plans",
      detail: "Included in a subscription plan that covers this model.",
    });
  }

  return paths;
}

/**
 * Counts over paired rows, so the headline matches the table below it: a model
 * sold as a free allocation and a paid row is one model, not two.
 */
export function pairedCatalogCounts(rows: PairedCatalogModel[]) {
  return {
    models: rows.length,
    free: rows.filter((row) => row.free !== null).length,
    paid: rows.filter((row) => row.paid !== null).length,
    subscriptionOnly: rows.filter(
      (row) => row.paid === null && row.subscription.length > 0,
    ).length,
  };
}
