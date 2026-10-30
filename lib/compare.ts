/**
 * Pure helpers for the two-model comparison. Nothing here touches the database
 * or the network: the page resolves a pair from ids and asks this module which
 * side wins a row, so both rules can be tested without a catalog.
 */
import type { ModelSummary } from "./types";

export type CompareSide = "left" | "right";

export type ComparePair = {
  left: ModelSummary;
  right: ModelSummary;
};

/**
 * Resolves `?a=` and `?b=` against the catalog. An unknown id is not an error:
 * the page still has to render, so a missing side falls back to the first model
 * that is not already on the other side. Comparing a model with itself is
 * refused the same way, because the two columns would be identical.
 *
 * The fallback prefers priced rows: a default comparison of two free models
 * would open on "Not priced" twice and say nothing about the catalog.
 */
export function resolveComparePair(
  models: ModelSummary[],
  leftId?: string | null,
  rightId?: string | null,
): ComparePair | null {
  if (models.length < 2) return null;

  const priced = models.filter((model) => model.access === "paid");
  const pool = priced.length >= 2 ? priced : models;
  const byId = new Map(models.map((model) => [model.id, model]));
  const left = (leftId ? byId.get(leftId) : undefined) ?? pool[0];
  const fallbackRight = (exclude: string) =>
    pool.find((model) => model.id !== exclude) ??
    models.find((model) => model.id !== exclude) ??
    null;
  const right =
    (rightId ? byId.get(rightId) : undefined) ?? fallbackRight(left.id);

  if (!right) return null;

  if (right.id === left.id) {
    const other = fallbackRight(left.id);

    return other ? { left, right: other } : null;
  }

  return { left, right };
}

/**
 * Marks the better side for one numeric row. `null` (not measured) and equal
 * values mark nothing, so a dash never silently wins or loses.
 */
export function betterSide(
  left: number | null | undefined,
  right: number | null | undefined,
  direction: "lower" | "higher",
): CompareSide | null {
  if (
    left == null ||
    right == null ||
    !Number.isFinite(left) ||
    !Number.isFinite(right) ||
    left === right
  ) {
    return null;
  }

  const leftWins = direction === "lower" ? left < right : left > right;

  return leftWins ? "left" : "right";
}

/** `true` when the side is the winner of a row, for the cell's data attribute. */
export function isBetter(side: CompareSide, winner: CompareSide | null) {
  return winner !== null && winner === side;
}
