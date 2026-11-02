/**
 * Admin fetch-all orchestration (FID-2026-1102-111).
 *
 * A single server request that ingests every source can outlive the request and
 * return an empty body. The admin control therefore walks the enabled sources
 * one at a time, using the existing single-source endpoint, so progress is
 * visible and one failure cannot hide the rest.
 */

export type FetchAllSource = {
  id: string;
  label: string;
  enabled: boolean;
};

export type FetchAllTarget = {
  id: string;
  label: string;
};

export type FetchAllResult = {
  sourceId: string;
  sourceLabel: string;
  ok: boolean;
  itemsSeen: number;
  itemsUpserted: number;
  error?: string;
};

export type FetchAllSummary = {
  sources: number;
  ok: number;
  failed: number;
  itemsStored: number;
  firstFailure: FetchAllResult | null;
};

type FetchBody = {
  error?: string;
  results?: FetchAllResult[];
};

/**
 * A proxy timeout can return an empty body. Never let that surface as a raw
 * `JSON.parse` error; report the HTTP status instead.
 */
export async function readFetchResult(
  response: Response,
): Promise<FetchAllResult> {
  const text = await response.text();
  let body: FetchBody = {};

  if (text) {
    try {
      body = JSON.parse(text) as FetchBody;
    } catch {
      throw new Error(
        `The server returned an unreadable response (HTTP ${response.status}).`,
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      body.error ?? `The server returned HTTP ${response.status}.`,
    );
  }

  const result = body.results?.[0];

  if (!result) throw new Error("The server returned no source result.");

  return result;
}

/** Disabled sources are never part of an operator-triggered refresh. */
export function enabledFetchTargets(
  sources: FetchAllSource[],
): FetchAllTarget[] {
  return sources
    .filter((source) => source.enabled)
    .map((source) => ({ id: source.id, label: source.label }));
}

/**
 * Sequential by design: each source commits its own cycle before the next
 * starts. A rejected request becomes a failed result, not a stopped batch.
 */
export async function runFetchAll(
  targets: FetchAllTarget[],
  fetchOne: (id: string) => Promise<FetchAllResult>,
  onProgress?: (target: FetchAllTarget, current: number, total: number) => void,
): Promise<FetchAllResult[]> {
  const results: FetchAllResult[] = [];

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];

    onProgress?.(target, index + 1, targets.length);

    try {
      results.push(await fetchOne(target.id));
    } catch (error) {
      results.push({
        sourceId: target.id,
        sourceLabel: target.label,
        ok: false,
        itemsSeen: 0,
        itemsUpserted: 0,
        error: error instanceof Error ? error.message : "Fetch failed.",
      });
    }
  }

  return results;
}

export function summarizeFetchAll(results: FetchAllResult[]): FetchAllSummary {
  const failures = results.filter((result) => !result.ok);

  return {
    sources: results.length,
    ok: results.length - failures.length,
    failed: failures.length,
    itemsStored: results.reduce(
      (total, result) => total + result.itemsUpserted,
      0,
    ),
    firstFailure: failures[0] ?? null,
  };
}
