/**
 * Parsing the Artificial Analysis catalogue payload: field aliases, numeric
 * cleanup, and the index revision. Pure, so the shape rules are testable
 * without a key, a network call or a database.
 */
import type { BenchmarkCandidate, ParsedBenchmarks } from "./benchmarks";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function measurement(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;

  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  // Keep a stable precision so two syncs of the same value compare equal.
  return Math.round(parsed * 1000) / 1000;
}

function versionText(value: unknown): string | null {
  // The live payload sends this as a number (`5` for v5.0). Stringify it as
  // major.minor rather than dropping it, or every score loses its provenance.
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? value.toFixed(1) : String(value);
  }

  return text(value) || null;
}

function indexVersionOf(root: Record<string, unknown> | null): string | null {
  // Top level in the live response (`intelligence_index_version`); the other
  // spellings are tolerated for older or alternate payloads.
  for (const key of [
    "intelligence_index_version",
    "index_version",
    "artificial_analysis_intelligence_index_version",
  ]) {
    const value = versionText(root?.[key]);

    if (value) return value;
  }

  return null;
}

/**
 * Their payload carries the catalogue under `data` (the documented shape) and
 * the measurements under `evaluations` / `performance`. A record with no
 * measurement at all is dropped: it would render as a dash and inflate the
 * "matched" count with rows that say nothing.
 */
export function parseAaBenchmarks(raw: unknown): ParsedBenchmarks {
  const body = record(raw);
  const list = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.models)
      ? body.models
      : [];
  const candidates: BenchmarkCandidate[] = [];
  let indexVersion = indexVersionOf(body);

  for (const entry of list) {
    const model = record(entry);

    if (!model) continue;

    const id = text(model.id);
    const slug = text(model.slug) || id;
    const name = text(model.name) || slug;

    if (!slug && !name) continue;

    const creator = record(model.model_creator);
    const evaluations = record(model.evaluations);
    const performance = record(model.performance);
    const intelligenceIndex = measurement(
      evaluations?.artificial_analysis_intelligence_index,
    );
    // The payload carries a coding and an agentic index beside the headline
    // one. They are the numbers a model choice actually turns on, and they were
    // being parsed off the wire and thrown away.
    const codingIndex = measurement(
      evaluations?.artificial_analysis_coding_index,
    );
    const agenticIndex = measurement(
      evaluations?.artificial_analysis_agentic_index,
    );
    const outputTokensPerSecond = measurement(
      performance?.median_output_tokens_per_second,
    );
    const ttftSeconds = measurement(
      performance?.median_time_to_first_token_seconds,
    );
    const endToEndSeconds = measurement(
      performance?.median_end_to_end_response_time_seconds,
    );

    if (!indexVersion) {
      indexVersion = indexVersionOf(evaluations);
    }

    if (
      intelligenceIndex === null &&
      codingIndex === null &&
      agenticIndex === null &&
      outputTokensPerSecond === null &&
      ttftSeconds === null &&
      endToEndSeconds === null
    ) {
      continue;
    }

    candidates.push({
      id,
      slug,
      name,
      creator: text(creator?.name),
      intelligenceIndex,
      codingIndex,
      agenticIndex,
      outputTokensPerSecond,
      ttftSeconds,
      endToEndSeconds,
      releaseDate: text(model.release_date) || null,
      measuredAt:
        text(model.evaluated_at) ||
        text(model.measured_at) ||
        text(evaluations?.evaluated_at) ||
        null,
    });
  }

  return { candidates, indexVersion };
}
