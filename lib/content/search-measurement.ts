/**
 * Signal search measurement (FID-2026-1103-132).
 *
 * Search is a bounded wildcard ILIKE over `title` and `excerpt`. That is correct
 * and cheap at the current corpus size; the open question is when it stops
 * being cheap. This module owns the percentiles and the decision rule so the
 * benchmark script and its test agree on what "slow enough to index" means.
 *
 * A trigram index has a real cost: an extension, a migration, and extra work on
 * every ingestion write. It is only justified when the measured read path is
 * actually slow, not when the corpus merely sounds large.
 */

export type SearchSample = {
  /** Search term used for the sample. */
  term: string;
  /** Wall-clock duration in milliseconds. */
  ms: number;
  /** Rows the query counted. */
  total: number;
};

export type SearchMeasurement = {
  corpus: number;
  samples: SearchSample[];
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  rowsPerQuery: number;
  decision: "keep-sequential-scan" | "add-trigram-index";
  thresholds: { p95Ms: number; corpus: number };
};

export const SEARCH_INDEX_THRESHOLDS = {
  /** p95 above this on a representative corpus justifies an index trial. */
  p95Ms: 50,
  /** Corpus size at which a scan deserves an index even if today is fast. */
  corpus: 25_000,
} as const;

export function percentile(samples: number[], fraction: number) {
  if (samples.length === 0) return 0;

  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );

  return sorted[index];
}

export function measureSearch(
  corpus: number,
  samples: SearchSample[],
): SearchMeasurement {
  const durations = samples.map((sample) => sample.ms);
  const rowsPerQuery =
    samples.length === 0
      ? 0
      : Math.round(
          samples.reduce((total, sample) => total + sample.total, 0) /
            samples.length,
        );
  const p95Ms = percentile(durations, 0.95);
  const addIndex =
    p95Ms > SEARCH_INDEX_THRESHOLDS.p95Ms ||
    corpus >= SEARCH_INDEX_THRESHOLDS.corpus;

  return {
    corpus,
    samples,
    p50Ms: percentile(durations, 0.5),
    p95Ms,
    maxMs: durations.length === 0 ? 0 : Math.max(...durations),
    rowsPerQuery,
    decision: addIndex ? "add-trigram-index" : "keep-sequential-scan",
    thresholds: SEARCH_INDEX_THRESHOLDS,
  };
}
