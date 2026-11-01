export type WilsonInterval = {
  low: number;
  high: number;
  center: number;
};

/**
 * Wilson score interval. Used for the deterministic-canary corroboration
 * rate, never as a substitution verdict.
 */
export function wilsonInterval(
  successes: number,
  samples: number,
  z = 1.96,
): WilsonInterval {
  if (samples <= 0) return { low: 0, high: 1, center: 0 };

  const bounded = Math.min(Math.max(successes, 0), samples);
  const proportion = bounded / samples;
  const denominator = 1 + (z * z) / samples;
  const center = (proportion + (z * z) / (2 * samples)) / denominator;
  const margin =
    (z *
      Math.sqrt(
        (proportion * (1 - proportion)) / samples +
          (z * z) / (4 * samples * samples),
      )) /
    denominator;

  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
    center: proportion,
  };
}
