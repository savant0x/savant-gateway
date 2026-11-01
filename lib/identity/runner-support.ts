import type { PostgresDatabase } from "../storage/pg-adapter.ts";
import type {
  IdentityCounts,
  IdentityCoverage,
  IdentityEstimate,
  IdentityFingerprintCoverage,
  IdentityGateCoverage,
  IdentityReferenceRecord,
  IdentityRunRecord,
  IdentityTarget,
} from "./types.ts";
import type { FingerprintComparison } from "./fingerprint.ts";
import type { GateContext, GateResult } from "./gates.ts";

import { DECISION } from "./battery.ts";
import { RunCancelled, RunFailure } from "./errors.ts";
import { canonicalJson, referenceContentHash } from "./protocol.ts";
import {
  countSamples,
  listSamples,
  setRunStatus,
  upsertFinding,
  upsertVerdict,
} from "./store.ts";
import { verdictSummary } from "./view.ts";

/**
 * Supporting reads and writers for the identity runner (FID-087).
 *
 * The split is the 400-line ceiling. Everything here is either a pure
 * projection or a single store call; the orchestration order lives in
 * `runner.ts`, and the reference/control decision lives in
 * `runner-verdict.ts`. Splitting them must not change what a run writes.
 */

export function parseSnapshot<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new RunFailure(
      "snapshot_invalid",
      `The ${label} snapshot is invalid.`,
    );
  }
}

export function plusDays(iso: string, days: number) {
  const time = Date.parse(iso);

  return new Date(
    (Number.isFinite(time) ? time : Date.now()) + days * 86_400_000,
  ).toISOString();
}

export function gateCoverage(result: GateResult): IdentityGateCoverage {
  return { state: result.state, n: result.n, note: result.note };
}

export function emptyCoverage(): IdentityCoverage {
  const gate = (): IdentityGateCoverage => ({
    state: "not_tested",
    n: 0,
    note: null,
  });

  return {
    shape: gate(),
    determinism: gate(),
    fingerprint: {
      state: "inconclusive",
      comparableCells: 0,
      meanJsd: null,
      noise: null,
      lower: null,
      upper: null,
      referenceProvider: null,
      controlPresent: false,
      controlDiscriminative: false,
      controlMeanJsd: null,
    },
    canary: gate(),
    deterministic: gate(),
    context: { ...gate(), testedDepth: null },
    tools: gate(),
    stream: gate(),
    logprobs: gate(),
  };
}

export async function writeFinding(
  db: PostgresDatabase,
  runId: string,
  className: string,
  metric: string,
  result: GateResult,
  now: string,
) {
  await upsertFinding(db, {
    runId,
    class: className,
    metric,
    state: result.state,
    n: result.n,
    observed: result.note,
    threshold: null,
    evidence: result.evidence,
    now,
  });
}

export function referenceIsValid(
  reference: IdentityReferenceRecord,
  protocolId: string,
  now: string,
) {
  if (reference.protocolId !== protocolId) return false;
  if (reference.expiresAt <= now) return false;

  let counts: IdentityCounts;

  try {
    counts = JSON.parse(reference.countsJson) as IdentityCounts;
  } catch {
    return false;
  }

  if (canonicalJson(counts) !== reference.countsJson) return false;

  return (
    referenceContentHash({
      canonicalModelKey: reference.canonicalModelKey,
      protocolId: reference.protocolId,
      providerSlug: reference.providerSlug,
      upstreamId: reference.upstreamId,
      collectedAt: reference.collectedAt,
      nPerCell: reference.nPerCell,
      counts,
    }) === reference.contentSha256
  );
}

export function fingerprintCoverage(
  comparison: FingerprintComparison | null,
  referenceProvider: "same" | "second" | null,
  controlPresent: boolean,
  controlDiscriminative: boolean,
  controlComparison: FingerprintComparison | null,
): IdentityFingerprintCoverage {
  return {
    state: comparison?.state ?? "inconclusive",
    comparableCells: comparison?.comparableCells ?? 0,
    meanJsd: comparison?.meanJsd ?? null,
    noise: comparison?.noise ?? null,
    lower: comparison?.lower ?? null,
    upper: comparison?.upper ?? null,
    referenceProvider,
    controlPresent,
    controlDiscriminative,
    controlMeanJsd: controlComparison?.meanJsd ?? null,
  };
}

export async function actualUsage(
  db: PostgresDatabase,
  runId: string,
  target: IdentityTarget,
  estimate: IdentityEstimate,
  startedAt: number,
  now: number,
) {
  const samples = await listSamples(db, runId);
  const promptTokens = samples.reduce(
    (total, sample) => total + (sample.promptTokens ?? 0),
    0,
  );
  const completionTokens = samples.reduce(
    (total, sample) => total + (sample.completionTokens ?? 0),
    0,
  );

  return {
    requests: samples.length,
    promptTokens,
    completionTokens,
    weightedTokens:
      promptTokens + completionTokens * Math.max(1, target.tokenWeight),
    costMicros: estimate.costMicros,
    minutes: Math.max(0, Math.round(((now - startedAt) / 60_000) * 10) / 10),
    quotaCheck: estimate.quotaCheck,
    effectiveMode: estimate.effectiveMode,
  };
}

export async function failRun(
  db: PostgresDatabase,
  run: IdentityRunRecord,
  failure: RunFailure,
  now: string,
) {
  const coverage = emptyCoverage();

  coverage.shape = {
    state: "fail",
    n: 0,
    note: failure.message,
  };

  await upsertVerdict(db, {
    runId: run.id,
    targetModelId: run.targetModelId,
    status: "error",
    summary: verdictSummary("error"),
    claims: [],
    limits: ["The last check failed before a verdict."],
    coverage,
    testedAt: now,
    validUntil: plusDays(now, DECISION.ttlDays),
    now,
  });
  await setRunStatus(db, run.id, "failed", {
    errorClass: failure.errorClass,
    errorMessage: failure.message.slice(0, 200),
    coverageJson: canonicalJson(coverage),
    completedAt: now,
  });
}

export async function assertNotCancelled(context: GateContext) {
  if (await context.cancelled()) throw new RunCancelled();
}

/**
 * The request cap is checked between gates, exactly as before the split: the
 * runner counts persisted samples so a resumed run carries its earlier budget.
 */
export function requestBudget(
  db: PostgresDatabase,
  runId: string,
  maxRequests: number,
) {
  return async () => {
    const counts = await countSamples(db, runId);

    if (counts.target + counts.diffControl > maxRequests) {
      throw new RunFailure(
        "request_cap",
        "The run exceeded the configured request cap.",
      );
    }
  };
}
