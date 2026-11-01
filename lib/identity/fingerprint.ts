import type { IdentityCounts } from "./types.ts";

import {
  BOOTSTRAP_DRAWS,
  BOOTSTRAP_SEED,
  DECISION,
  SMOOTHING,
  SPLIT_HALF_SEED,
} from "./battery.ts";
import { splitHalfQ95 } from "./stats/split-half.ts";
import { bootstrapMeanCi, jsd, mean, totalCount } from "./stats/jsd.ts";

export type FingerprintCellComparison = {
  id: string;
  n: number;
  jsd: number;
  q95Ref: number;
  q95Target: number;
};

export type FingerprintComparison = {
  state: "consistent" | "divergent" | "inconclusive";
  comparableCells: number;
  cells: FingerprintCellComparison[];
  meanJsd: number | null;
  lower: number | null;
  upper: number | null;
  noise: number;
};

function seedFromString(value: string) {
  let seed = 0;

  for (let index = 0; index < value.length; index += 1) {
    seed = (seed * 31 + value.charCodeAt(index)) >>> 0;
  }

  return seed;
}

function entropy(counts: Record<string, number>) {
  const total = totalCount(counts);

  if (total <= 0) return 0;

  let value = 0;

  for (const count of Object.values(counts)) {
    if (count <= 0) continue;

    const probability = count / total;

    value -= probability * Math.log2(probability);
  }

  return value;
}

/**
 * Compares the target and reference counts cell by cell. The reference's own
 * split-half spread sets the noise floor; the multipliers are sealed protocol
 * constants, not universal JSD thresholds.
 */
export function compareFingerprint(
  target: IdentityCounts,
  reference: IdentityCounts,
): FingerprintComparison {
  const cells: FingerprintCellComparison[] = [];

  for (const [id, referenceCell] of Object.entries(reference.cells)) {
    const targetCell = target.cells[id];

    if (
      !targetCell ||
      targetCell.n < DECISION.minSamplesPerCell ||
      referenceCell.n < DECISION.minSamplesPerCell
    ) {
      continue;
    }

    const seed = SPLIT_HALF_SEED + seedFromString(id);

    cells.push({
      id,
      n: Math.min(targetCell.n, referenceCell.n),
      jsd: jsd(targetCell.counts, referenceCell.counts, SMOOTHING),
      q95Ref: splitHalfQ95(referenceCell.counts, undefined, seed),
      q95Target: splitHalfQ95(targetCell.counts, undefined, seed + 1),
    });
  }

  const values = cells.map((cell) => cell.jsd);
  const meanJsd = mean(values);
  const interval = bootstrapMeanCi(values, BOOTSTRAP_DRAWS, BOOTSTRAP_SEED);
  const noise = Math.max(
    mean(cells.map((cell) => cell.q95Ref)) ?? DECISION.noiseFloor,
    mean(cells.map((cell) => cell.q95Target)) ?? DECISION.noiseFloor,
    DECISION.noiseFloor,
  );

  let state: FingerprintComparison["state"] = "inconclusive";

  if (cells.length >= DECISION.minComparableCells) {
    if (
      interval.high !== null &&
      interval.high <= DECISION.consistentMultiplier * noise
    ) {
      state = "consistent";
    } else if (
      interval.low !== null &&
      interval.low > DECISION.divergentMultiplier * noise
    ) {
      state = "divergent";
    }
  }

  return {
    state,
    comparableCells: cells.length,
    cells,
    meanJsd,
    lower: interval.low,
    upper: interval.high,
    noise,
  };
}

export type CacheScreen = {
  suspect: boolean;
  modalShare: number | null;
  entropy: number | null;
  singleTokenCells: number;
  referencePositiveEntropy: boolean;
};

/**
 * Descriptive only. A route can be deterministic without being a replay, so
 * this never becomes the verdict by itself.
 */
export function cacheScreen(
  target: IdentityCounts,
  reference: IdentityCounts,
): CacheScreen {
  const targetCells = Object.values(target.cells).filter((cell) => cell.n > 0);

  if (targetCells.length === 0) {
    return {
      suspect: false,
      modalShare: null,
      entropy: null,
      singleTokenCells: 0,
      referencePositiveEntropy: false,
    };
  }

  let singleTokenCells = 0;
  let modalTotal = 0;
  let entropyTotal = 0;

  for (const cell of targetCells) {
    const entries = Object.entries(cell.counts);
    const modal = Math.max(0, ...entries.map(([, count]) => count));

    modalTotal += modal / cell.n;
    entropyTotal += entropy(cell.counts);

    if (entries.length === 1) singleTokenCells += 1;
  }

  const referencePositiveEntropy = Object.values(reference.cells).some(
    (cell) => entropy(cell.counts) > 0.05,
  );

  return {
    suspect:
      singleTokenCells === targetCells.length &&
      referencePositiveEntropy &&
      targetCells.length >= DECISION.minComparableCells,
    modalShare: modalTotal / targetCells.length,
    entropy: entropyTotal / targetCells.length,
    singleTokenCells,
    referencePositiveEntropy,
  };
}
