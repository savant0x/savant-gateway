import { SMOOTHING, SPLIT_HALF_DRAWS, SPLIT_HALF_SEED } from "../battery.ts";

import { jsd, mulberry32, quantile, totalCount, type CountMap } from "./jsd.ts";

function splitCounts(counts: CountMap, random: () => number) {
  const left: CountMap = {};
  const right: CountMap = {};

  for (const [key, count] of Object.entries(counts)) {
    for (let index = 0; index < count; index += 1) {
      const bucket = random() < 0.5 ? left : right;

      bucket[key] = (bucket[key] ?? 0) + 1;
    }
  }

  return { left, right };
}

/**
 * The 95th percentile of the JSD between two random halves of one multiset.
 * This is the route's own noise floor, not a universal threshold.
 */
export function splitHalfQ95(
  counts: CountMap,
  draws = SPLIT_HALF_DRAWS,
  seed = SPLIT_HALF_SEED,
) {
  if (totalCount(counts) < 2) return 0;

  const values: number[] = [];

  for (let draw = 0; draw < draws; draw += 1) {
    const { left, right } = splitCounts(counts, mulberry32(seed + draw));

    values.push(jsd(left, right, SMOOTHING));
  }

  return quantile(values, 0.95) ?? 0;
}
