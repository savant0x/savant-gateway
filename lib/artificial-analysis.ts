import "server-only";

import type { BenchmarkCandidate, ParsedBenchmarks } from "./benchmarks";

import { parseAaBenchmarks } from "./benchmarks-parse";

const DEFAULT_BASE_URL = "https://artificialanalysis.ai/api/v2";
const PAGE_SIZE = 200;
// The free tier allows 100 requests per 24h window; the live catalogue (379
// records) is two pages of 200. The cap keeps a pagination bug from spending the
// whole window in one run.
const MAX_PAGES = 5;
const FETCH_TIMEOUT_MS = 15_000;

export function artificialAnalysisConfigured(): boolean {
  return Boolean(process.env.ARTIFICIAL_ANALYSIS_API_KEY?.trim());
}

function baseUrl() {
  return (
    process.env.ARTIFICIAL_ANALYSIS_BASE_URL?.trim().replace(/\/+$/, "") ||
    DEFAULT_BASE_URL
  );
}

function quotaFrom(headers: Headers): number | null {
  const raw = headers.get("x-ratelimit-remaining");
  const parsed = raw === null ? Number.NaN : Number(raw);

  return Number.isFinite(parsed) ? parsed : null;
}

function meta(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Honours their pagination when it is present and falls back to "a full page
 * probably has a successor" when it is not. Never loops past MAX_PAGES.
 */
function pageHasMore(raw: unknown, received: number): boolean {
  const body = meta(raw);
  const pagination = meta(body?.pagination) ?? meta(body?.meta);
  const flag = pagination?.has_more;

  if (typeof flag === "boolean") return flag;

  const totalPages = pagination?.total_pages;

  if (typeof totalPages === "number" && Number.isFinite(totalPages)) {
    const page = pagination?.page;

    return typeof page === "number" ? page < totalPages : false;
  }

  return received >= PAGE_SIZE;
}

type PageResult = {
  candidates: BenchmarkCandidate[];
  indexVersion: string | null;
  quotaRemaining: number | null;
  hasMore: boolean;
  /** Raw records on the page, before unmeasured ones are dropped by parsing. */
  received: number;
};

async function fetchPage(page: number): Promise<PageResult> {
  const key = process.env.ARTIFICIAL_ANALYSIS_API_KEY?.trim();

  if (!key) throw new Error("Artificial Analysis API key is not configured.");

  const url = new URL(`${baseUrl()}/language/models/free`);

  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(PAGE_SIZE));

  const response = await fetch(url, {
    headers: { Accept: "application/json", "x-api-key": key },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });

  if (response.status === 429) {
    throw new Error(
      "Artificial Analysis rate limit reached (HTTP 429); the window resets on their schedule.",
    );
  }

  if (!response.ok) {
    throw new Error(`Artificial Analysis returned HTTP ${response.status}`);
  }

  const raw: unknown = await response.json();
  const parsed = parseAaBenchmarks(raw);
  const body = meta(raw);
  const received = Array.isArray(body?.data)
    ? body.data.length
    : Array.isArray(body?.models)
      ? body.models.length
      : 0;

  return {
    candidates: parsed.candidates,
    indexVersion: parsed.indexVersion,
    quotaRemaining: quotaFrom(response.headers),
    hasMore: pageHasMore(raw, received),
    received,
  };
}

/**
 * Fetches the whole free catalogue. It runs from the sync path only: a page
 * render must never wait on three sequential requests against a shared quota.
 */
export async function fetchBenchmarkCatalog(): Promise<{
  parsed: ParsedBenchmarks;
  quotaRemaining: number | null;
}> {
  const candidates: BenchmarkCandidate[] = [];
  let indexVersion: string | null = null;
  let quotaRemaining: number | null = null;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await fetchPage(page);

    candidates.push(...result.candidates);
    indexVersion = indexVersion ?? result.indexVersion;
    quotaRemaining = result.quotaRemaining ?? quotaRemaining;

    // A short page is the last page even if the flag disagrees. Count raw
    // records, not parsed ones: unmeasured records are dropped, not absent.
    if (!result.hasMore || result.received < PAGE_SIZE) break;
  }

  return {
    parsed: { candidates, indexVersion },
    quotaRemaining,
  };
}
