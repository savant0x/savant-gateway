import type { ModelAccess } from "./types.ts";

/**
 * Column sorting for the public catalog.
 *
 * The rules are pure so the ordering can be tested without a DOM. Two rules
 * matter: a missing measurement or comparison is never treated as zero (it
 * sorts last in both directions), and ties always fall back to the model name
 * so a table cannot shuffle between renders.
 */
export type CatalogSortKey =
  | "model"
  | "group"
  | "weight"
  | "features"
  | "benchmark"
  | "price"
  | "comparison";

export type CatalogSortDirection = "asc" | "desc";

export type SortableCatalogRow = {
  id: string;
  name: string;
  family: string;
  groupLabel: string;
  groupBillingMode: ModelAccess;
  tokenWeight: number;
  supportsTools: boolean;
  supportsVision: boolean;
  inputPricePer1M: number;
  outputPricePer1M: number;
  /** Artificial Analysis intelligence index, or null when unmeasured. */
  benchmarkIndex: number | null;
  /** Blended rate delta against the OpenRouter list, or null when unmatched. */
  comparisonBps: number | null;
};

const DEFAULT_DIRECTION: Record<CatalogSortKey, CatalogSortDirection> = {
  model: "asc",
  group: "asc",
  weight: "desc",
  features: "desc",
  benchmark: "desc",
  price: "asc",
  comparison: "asc",
};

export function defaultSortDirection(key: CatalogSortKey) {
  return DEFAULT_DIRECTION[key];
}

/** Null sorts last in both directions: absence is not a low value. */
function compareNumber(
  left: number | null,
  right: number | null,
  direction: CatalogSortDirection,
) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  return direction === "desc" ? right - left : left - right;
}

function featureScore(row: SortableCatalogRow) {
  return (row.supportsTools ? 1 : 0) + (row.supportsVision ? 1 : 0);
}

export function compareCatalogRows(
  left: SortableCatalogRow,
  right: SortableCatalogRow,
  key: CatalogSortKey,
  direction: CatalogSortDirection,
) {
  let primary = 0;

  if (key === "model") {
    primary =
      left.name.localeCompare(right.name) ||
      left.family.localeCompare(right.family);
    if (direction === "desc") primary = -primary;
  } else if (key === "group") {
    primary = left.groupLabel.localeCompare(right.groupLabel);
    if (direction === "desc") primary = -primary;
  } else if (key === "weight") {
    primary = compareNumber(
      left.tokenWeight > 0 ? left.tokenWeight : null,
      right.tokenWeight > 0 ? right.tokenWeight : null,
      direction,
    );
  } else if (key === "features") {
    primary = compareNumber(
      featureScore(left) > 0 ? featureScore(left) : null,
      featureScore(right) > 0 ? featureScore(right) : null,
      direction,
    );
  } else if (key === "benchmark") {
    primary = compareNumber(
      left.benchmarkIndex,
      right.benchmarkIndex,
      direction,
    );
  } else if (key === "price") {
    primary =
      compareNumber(left.inputPricePer1M, right.inputPricePer1M, direction) ||
      compareNumber(left.outputPricePer1M, right.outputPricePer1M, direction);
  } else {
    primary = compareNumber(left.comparisonBps, right.comparisonBps, direction);
  }

  return (
    primary ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  );
}

export function sortCatalogRows<T extends SortableCatalogRow>(
  rows: T[],
  key: CatalogSortKey,
  direction: CatalogSortDirection,
) {
  return [...rows].sort((left, right) =>
    compareCatalogRows(left, right, key, direction),
  );
}
