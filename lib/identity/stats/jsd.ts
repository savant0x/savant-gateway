/** Distribution and divergence math for the identity fingerprint. */

export type CountMap = Record<string, number>;

export function totalCount(counts: CountMap) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

export function distribution(counts: CountMap, smoothing = 0) {
  const keys = Object.keys(counts);
  const total = totalCount(counts) + smoothing * Math.max(keys.length, 1);

  if (total <= 0) return {} as Record<string, number>;

  const output: Record<string, number> = {};

  for (const key of keys) {
    const mass = (counts[key] ?? 0) + smoothing;

    if (mass > 0) output[key] = mass / total;
  }

  return output;
}

function klDivergence(
  left: Record<string, number>,
  right: Record<string, number>,
) {
  let total = 0;

  for (const [key, value] of Object.entries(left)) {
    if (value <= 0) continue;

    const other = right[key] ?? 0;

    if (other <= 0) return Number.POSITIVE_INFINITY;

    total += value * Math.log2(value / other);
  }

  return total;
}

/** Jensen-Shannon divergence in bits. Identical distributions give zero. */
export function jsd(left: CountMap, right: CountMap, smoothing = 0) {
  const p = distribution(left, smoothing);
  const q = distribution(right, smoothing);
  const keys = new Set([...Object.keys(p), ...Object.keys(q)]);

  if (keys.size === 0) return 0;

  const mixed: Record<string, number> = {};

  for (const key of Array.from(keys)) {
    mixed[key] = ((p[key] ?? 0) + (q[key] ?? 0)) / 2;
  }

  const value = (klDivergence(p, mixed) + klDivergence(q, mixed)) / 2;

  return Number.isFinite(value) ? Math.max(0, value) : 1;
}

export function mean(values: number[]) {
  if (values.length === 0) return null;

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function quantile(values: number[], q: number) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => left - right);
  const position = Math.min(1, Math.max(0, q)) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) return sorted[lower];

  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** A small deterministic PRNG; the seed is part of the protocol. */
export function mulberry32(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let value = state;

    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export type Interval = { low: number | null; high: number | null };

/** Percentile bootstrap over cells; cells are the independent unit. */
export function bootstrapMeanCi(
  values: number[],
  draws: number,
  seed: number,
): Interval {
  if (values.length === 0) return { low: null, high: null };

  const random = mulberry32(seed);
  const means: number[] = [];

  for (let draw = 0; draw < draws; draw += 1) {
    let total = 0;

    for (let index = 0; index < values.length; index += 1) {
      total += values[Math.floor(random() * values.length)];
    }

    means.push(total / values.length);
  }

  return { low: quantile(means, 0.025), high: quantile(means, 0.975) };
}
