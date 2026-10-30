/**
 * Benchmark data from Artificial Analysis. Everything here is pure: parsing
 * their payload, normalising identifiers on both sides, matching them, and
 * deciding whether a sync is trustworthy enough to write. Nothing touches the
 * network or the database, so the matching rules are testable without a key.
 *
 * Two rules matter more than coverage:
 *   - a null measurement is not zero, and an unmatched model is not unmeasured;
 *   - an ambiguous key is refused rather than guessed, because a wrong match
 *     hands one model's score to another.
 */

export const BENCHMARK_SOURCE = "artificial_analysis";
export const AA_ATTRIBUTION_URL = "https://artificialanalysis.ai/";

export type BenchmarkCandidate = {
  id: string;
  slug: string;
  name: string;
  creator: string;
  intelligenceIndex: number | null;
  codingIndex: number | null;
  agenticIndex: number | null;
  outputTokensPerSecond: number | null;
  ttftSeconds: number | null;
  endToEndSeconds: number | null;
  /** The model's release date as the source publishes it, if it does. */
  releaseDate: string | null;
  measuredAt: string | null;
};

export type ParsedBenchmarks = {
  candidates: BenchmarkCandidate[];
  /** The index revision the numbers belong to, e.g. "5.0". Null when unstated. */
  indexVersion: string | null;
};

/** One measured row as the catalog consumes it. A null is "not measured". */
export type BenchmarkSummary = {
  intelligenceIndex: number | null;
  codingIndex: number | null;
  agenticIndex: number | null;
  indexVersion: string | null;
  /** The source slug these numbers were matched on, for provenance. */
  sourceSlug: string | null;
  outputTokensPerSecond: number | null;
  ttftSeconds: number | null;
  endToEndSeconds: number | null;
  releaseDate: string | null;
  measuredAt: string | null;
  stale: boolean;
};

/** The newest sync's outcome, for the catalog footnote and the admin panel. */
export type BenchmarkStatus = {
  configured: boolean;
  syncedAt: string | null;
  indexVersion: string | null;
  candidates: number;
  matched: number;
  total: number;
  quotaRemaining: number | null;
  running: boolean;
  lastAttemptAt: string | null;
  lastError: string | null;
};

/**
 * `deepseek-v4-pro-0813` is the 0813 build of `deepseek-v4-pro`; the trailing
 * four-digit tag is a build stamp, not part of the identity. Stripping it lets
 * that row find the source record without letting a differently named model
 * borrow a score.
 */
export function withoutBuildDate(key: string): string {
  return key.replace(/-\d{4}$/, "");
}

export type MatchableModel = {
  id: string;
  upstreamId: string;
  name: string;
  family: string;
};

export type BenchmarkMatch = {
  modelId: string;
  sourceId: string | null;
  sourceSlug: string | null;
  intelligenceIndex: number | null;
  codingIndex: number | null;
  agenticIndex: number | null;
  outputTokensPerSecond: number | null;
  ttftSeconds: number | null;
  endToEndSeconds: number | null;
  releaseDate: string | null;
  measuredAt: string | null;
  matchedBy: "slug" | "slug_without_build" | "name" | "creator_name";
};

export type MatchOutcome = {
  matches: Record<string, BenchmarkMatch>;
  matched: number;
  /** Model ids whose key resolved to more than one record; deliberately unmatched. */
  ambiguous: string[];
};

/** `free/claude-opus-4.6`, `claude-opus-4-6` and ` Claude Opus 4.6 ` align. */
export function normalizeModelKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^free\//, "")
    .replace(/[._\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

type CandidateIndex = Map<string, BenchmarkCandidate | null>;

function addToIndex(
  index: CandidateIndex,
  key: string,
  candidate: BenchmarkCandidate,
) {
  if (!key) return;

  const existing = index.get(key);

  if (existing === undefined) {
    index.set(key, candidate);

    return;
  }

  // Two records for one key is a collision, not a preference order.
  if (existing !== null && existing !== candidate) index.set(key, null);
}

function buildIndexes(candidates: BenchmarkCandidate[]) {
  const bySlug: CandidateIndex = new Map();
  const byName: CandidateIndex = new Map();
  const byCreatorAndName: CandidateIndex = new Map();

  for (const candidate of candidates) {
    addToIndex(bySlug, normalizeModelKey(candidate.slug), candidate);
    addToIndex(byName, normalizeModelKey(candidate.name), candidate);
    addToIndex(
      byCreatorAndName,
      `${normalizeModelKey(candidate.creator)}|${normalizeModelKey(candidate.name)}`,
      candidate,
    );
  }

  return { bySlug, byName, byCreatorAndName };
}

function toMatch(
  modelId: string,
  candidate: BenchmarkCandidate,
  matchedBy: BenchmarkMatch["matchedBy"],
): BenchmarkMatch {
  return {
    modelId,
    sourceId: candidate.id || null,
    sourceSlug: candidate.slug || null,
    intelligenceIndex: candidate.intelligenceIndex,
    codingIndex: candidate.codingIndex,
    agenticIndex: candidate.agenticIndex,
    outputTokensPerSecond: candidate.outputTokensPerSecond,
    ttftSeconds: candidate.ttftSeconds,
    endToEndSeconds: candidate.endToEndSeconds,
    releaseDate: candidate.releaseDate,
    measuredAt: candidate.measuredAt,
    matchedBy,
  };
}

/**
 * Matches on normalised identity only, in decreasing specificity. A key that
 * resolves to two records is refused and reported, never resolved by order.
 */
export function matchBenchmarks(
  candidates: BenchmarkCandidate[],
  models: MatchableModel[],
): MatchOutcome {
  const { bySlug, byName, byCreatorAndName } = buildIndexes(candidates);
  const matches: Record<string, BenchmarkMatch> = {};
  const ambiguous: string[] = [];

  for (const model of models) {
    const slugKeys = [model.upstreamId, model.id]
      .map(normalizeModelKey)
      .filter(Boolean);
    const nameKey = normalizeModelKey(model.name);
    const creatorKey = `${normalizeModelKey(model.family)}|${nameKey}`;
    let resolved = false;

    // A slug collision is decisive: the id is the identity, so refuse.
    for (const key of slugKeys) {
      const hit = bySlug.get(key);

      if (hit === null) {
        ambiguous.push(model.id);
        resolved = true;

        break;
      }

      if (hit) {
        matches[model.id] = toMatch(model.id, hit, "slug");
        resolved = true;

        break;
      }
    }

    // A build date on our side is not a different model on theirs: their record
    // for `deepseek-v4-pro` is named "DeepSeek V4 Pro 0813 (Max)". Only our own
    // trailing date is dropped, and only against an unambiguous slug, so a
    // model they do not publish still resolves to nothing.
    if (!resolved) {
      for (const key of slugKeys.map(withoutBuildDate).filter(Boolean)) {
        const hit = bySlug.get(key);

        if (hit === null) {
          ambiguous.push(model.id);
          resolved = true;

          break;
        }

        if (hit) {
          matches[model.id] = toMatch(model.id, hit, "slug_without_build");
          resolved = true;

          break;
        }
      }
    }

    if (resolved) continue;

    const byNameHit = byName.get(nameKey);

    if (byNameHit) {
      matches[model.id] = toMatch(model.id, byNameHit, "name");

      continue;
    }

    // Two families can ship the same display name; the creator settles it when
    // it does, and the row is refused when it does not.
    const byCreatorHit = byCreatorAndName.get(creatorKey);

    if (byCreatorHit) {
      matches[model.id] = toMatch(model.id, byCreatorHit, "creator_name");

      continue;
    }

    if (byNameHit === null) ambiguous.push(model.id);
  }

  return { matches, matched: Object.keys(matches).length, ambiguous };
}

export type SyncTotals = { candidates: number; matched: number };

/**
 * Guards the write against a truncated or substituted payload. An HTML error
 * page parses as "zero models", and a naive upsert would then mark every row
 * stale — the feature quietly erasing itself. A collapse is treated as a failed
 * sync instead, and the existing rows are left alone.
 */
export function benchmarkSanityProblem(
  previous: SyncTotals | null,
  next: SyncTotals,
): string | null {
  if (next.candidates === 0) {
    return "The payload carried no benchmark records.";
  }

  if (!previous) return null;

  if (
    previous.candidates >= 20 &&
    next.candidates < previous.candidates * 0.5
  ) {
    return `Payload shrank from ${previous.candidates} to ${next.candidates} records.`;
  }

  if (
    previous.matched >= 5 &&
    next.matched < Math.ceil(previous.matched * 0.8)
  ) {
    return `Matches fell from ${previous.matched} to ${next.matched} rows.`;
  }

  return null;
}
