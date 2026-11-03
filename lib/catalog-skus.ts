import type { ModelAccess, ModelSummary } from "./types.ts";

import { canonicalModelKey } from "./model-identity.ts";

/**
 * One catalog row per SKU, not per model identity.
 *
 * A provider may publish the same weights twice — a `free/` allocation and the
 * metered id — and they are separate products with separate admission,
 * settlement and names. Grouping by model identity is right for routing and
 * fingerprinting and wrong for the catalog: it gave one row two access chips,
 * a paid title and only the paid detail link.
 *
 * Rows of the same billing tier still merge across providers, because the
 * gateway routes that tier to one serving row. The tier is part of the SKU key,
 * so free, paid and subscription rows never absorb one another.
 */
export type CatalogSkuRow = {
  /** Stable React key and lookup identity for this SKU. */
  key: string;
  /** The published row that names, prices and links this SKU. */
  model: ModelSummary;
  /** The name the catalog shows, qualified when the access is not paid. */
  name: string;
  /** Same-SKU rows from other providers; never a different billing tier. */
  variants: ModelSummary[];
};

/**
 * Paid is the default product; the free and subscription products are the ones
 * that need qualification. The suffix is presentation only: the stored name
 * stays the provider's, and the id remains the SKU.
 */
export function catalogSkuName(
  model: Pick<ModelSummary, "name" | "access">,
): string {
  if (model.access === "free") return `${model.name} (Free)`;
  if (model.access === "subscription") return `${model.name} (Subscription)`;

  return model.name;
}

function skuKey(model: ModelSummary) {
  return `${model.access}:${canonicalModelKey(model.upstreamId || model.id)}`;
}

/**
 * A provider's own row names the SKU when several providers publish the same
 * tier: a namespaced id (`apixo/glm-5.3`) is the alternate route, not the
 * product name. Ties fall back to the id so the row cannot shuffle.
 */
function displayRank(model: ModelSummary) {
  return model.id.includes("/") ? 1 : 0;
}

export function catalogSkuRows(models: ModelSummary[]): CatalogSkuRow[] {
  const groups = new Map<string, ModelSummary[]>();

  for (const model of models) {
    const key = skuKey(model);
    const members = groups.get(key);

    if (members) members.push(model);
    else groups.set(key, [model]);
  }

  return Array.from(groups, ([key, members]) => {
    const variants = [...members].sort(
      (left, right) =>
        displayRank(left) - displayRank(right) ||
        left.id.localeCompare(right.id),
    );
    const model = variants[0];

    return {
      key,
      model,
      name: catalogSkuName(model),
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
 * The one purchase path a SKU offers. Every href is a route that already knows
 * the customer's balance and plan state, so the catalog never invents a
 * checkout.
 */
export function catalogAccessPath(model: ModelSummary): CatalogAccessPath {
  if (model.access === "free") {
    return {
      access: "free",
      label: "Free tier",
      href: "/dashboard",
      detail:
        "Free access draws on a daily weighted-token allowance and shared upstream capacity. Open the console for a key.",
    };
  }

  if (model.access === "subscription") {
    return {
      access: "subscription",
      label: "See plans",
      href: "/plans",
      detail: "Included in a subscription plan that covers this model.",
    };
  }

  return {
    access: "paid",
    label: "Buy credit",
    href: "/account",
    detail: "Prepaid credit, settled at the published per-token rate.",
  };
}

/** Counts over SKU rows, so the headline matches the table below it. */
export function catalogSkuCounts(rows: CatalogSkuRow[]) {
  return {
    skus: rows.length,
    free: rows.filter((row) => row.model.access === "free").length,
    paid: rows.filter((row) => row.model.access === "paid").length,
    subscription: rows.filter((row) => row.model.access === "subscription")
      .length,
  };
}
