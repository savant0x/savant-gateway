import type { PostgresDatabase } from "../storage/pg-adapter.ts";
import type { ProbeClient, ProbeProvider } from "./probe-client.ts";
import type {
  IdentityControlSnapshot,
  IdentityCoverage,
  IdentityEstimate,
  IdentityProviderSnapshot,
  IdentitySampleRecord,
  IdentityTarget,
} from "./types.ts";

import { DECISION } from "./battery.ts";
import { RunCancelled, RunFailure } from "./errors.ts";
import {
  runCanary,
  runDeterminism,
  runDeterministicCanaries,
  runFingerprint,
  runShape,
  type GateContext,
} from "./gates.ts";
import {
  runContext,
  runLogprobs,
  runStreams,
  runTools,
} from "./gates-extra.ts";
import { canonicalJson, verifyProtocol } from "./protocol.ts";
import {
  claimRun,
  deleteExpiredSamples,
  getProtocol,
  getRun,
  insertSample,
  isCancelRequested,
  setRunStatus,
  sweepStaleRuns,
  upsertVerdict,
} from "./store.ts";
import { decideVerdict } from "./verdict.ts";
import {
  actualUsage,
  assertNotCancelled,
  failRun,
  gateCoverage,
  parseSnapshot,
  plusDays,
  requestBudget,
  writeFinding,
} from "./runner-support.ts";
import { evaluateFingerprint } from "./runner-verdict.ts";

export type RunnerDeps = {
  probe: ProbeClient;
  now: () => number;
  resolveProvider: (slug: string) => Promise<ProbeProvider | undefined>;
  randomBytes: (size: number) => Uint8Array;
  maxRequests: number;
  retentionDays: number;
};

/**
 * The identity run orchestrator (FID-087).
 *
 * `executeRun` owns the order of gates, the sample writes, and the final
 * verdict. Reference selection and the fingerprint comparison live in
 * `runner-verdict.ts`; the projection and single-call writers live in
 * `runner-support.ts`. The split is the 400-line ceiling, not a change in
 * behavior: every store call happens in the same order as before.
 */
export async function executeRun(
  db: PostgresDatabase,
  runId: string,
  deps: RunnerDeps,
): Promise<void> {
  const nowIso = () => new Date(deps.now()).toISOString();

  if (!(await claimRun(db, runId, nowIso()))) return;

  const run = await getRun(db, runId);

  if (!run) return;

  const startedAt = run.startedAt ? Date.parse(run.startedAt) : deps.now();

  try {
    await sweepStaleRuns(db, nowIso());
    await deleteExpiredSamples(db, nowIso(), deps.retentionDays);

    const protocol = await getProtocol(db, run.protocolId);

    if (!protocol || !verifyProtocol(protocol).ok) {
      throw new RunFailure(
        "protocol_mismatch",
        "The stored identity protocol does not match the current battery.",
      );
    }

    const target = parseSnapshot<IdentityTarget>(run.targetJson, "target");
    const providerSnapshot = parseSnapshot<IdentityProviderSnapshot>(
      run.providerJson,
      "provider",
    );
    const control = run.controlJson
      ? parseSnapshot<IdentityControlSnapshot>(run.controlJson, "control")
      : null;
    const liveProvider = await deps.resolveProvider(providerSnapshot.slug);

    if (!liveProvider) {
      throw new RunFailure(
        "provider_missing",
        "The run's provider is not available in the live registry.",
      );
    }

    const context: GateContext = {
      runId,
      target,
      provider: liveProvider,
      probe: deps.probe,
      now: nowIso,
      randomBytes: deps.randomBytes,
      write: async (sample: IdentitySampleRecord) => {
        await insertSample(db, sample);
      },
      cancelled: () => isCancelRequested(db, runId),
    };
    const budget = requestBudget(db, runId, deps.maxRequests);

    await assertNotCancelled(context);

    const shape = await runShape(context);

    await writeFinding(db, runId, "shape", "envelope", shape, nowIso());

    if (shape.state !== "pass") {
      await failRun(
        db,
        run,
        new RunFailure("shape_failed", shape.note ?? "Shape failed."),
        nowIso(),
      );

      return;
    }

    await budget();
    await assertNotCancelled(context);

    const determinism = await runDeterminism(context);

    await writeFinding(
      db,
      runId,
      "determinism",
      "agreement",
      determinism,
      nowIso(),
    );
    await budget();
    await assertNotCancelled(context);

    const canary = await runCanary(context);

    await writeFinding(db, runId, "canary", "leakage", canary, nowIso());
    await budget();
    await assertNotCancelled(context);

    const deterministic = await runDeterministicCanaries(context);

    await writeFinding(
      db,
      runId,
      "deterministic",
      "answer_rate",
      deterministic,
      nowIso(),
    );
    await budget();
    await assertNotCancelled(context);

    const fingerprint = await runFingerprint(context, "target");

    await budget();
    await assertNotCancelled(context);

    const now = nowIso();
    const outcome = await evaluateFingerprint({
      db,
      run,
      target,
      providerSnapshot,
      control,
      fingerprint,
      context,
      deps,
      now,
      nowIso,
    });
    const referenceCounts = outcome.referenceCounts;

    await budget();
    await assertNotCancelled(context);

    const contextGate = await runContext(context);

    await writeFinding(
      db,
      runId,
      "context",
      "retrieval",
      contextGate,
      nowIso(),
    );
    await budget();
    await assertNotCancelled(context);

    const tools = await runTools(context);

    await writeFinding(db, runId, "tools", "schema", tools, nowIso());
    await budget();
    await assertNotCancelled(context);

    const streams = await runStreams(context);

    await writeFinding(db, runId, "stream", "sse", streams, nowIso());
    await budget();
    await assertNotCancelled(context);

    const logprobs = await runLogprobs(context, referenceCounts);

    await writeFinding(db, runId, "logprobs", "top1", logprobs, nowIso());

    const coverage: IdentityCoverage = {
      shape: gateCoverage(shape),
      determinism: gateCoverage(determinism),
      fingerprint: outcome.coverage,
      canary: gateCoverage(canary),
      deterministic: gateCoverage(deterministic),
      context: {
        ...gateCoverage(contextGate),
        testedDepth: contextGate.testedDepth,
      },
      tools: gateCoverage(tools),
      stream: gateCoverage(streams),
      logprobs: gateCoverage(logprobs),
    };
    const testedAt = nowIso();
    const verdict = decideVerdict({
      mode: run.mode,
      collectedBaseline: outcome.collectedBaseline,
      coverage,
      testedAt,
    });
    const estimate = parseSnapshot<IdentityEstimate>(
      run.estimateJson,
      "estimate",
    );

    await upsertVerdict(db, {
      runId,
      targetModelId: run.targetModelId,
      status: verdict.status,
      summary: verdict.summary,
      claims: verdict.claims,
      limits: verdict.limits,
      coverage: verdict.coverage,
      testedAt,
      validUntil: plusDays(testedAt, DECISION.ttlDays),
      now: testedAt,
    });
    await setRunStatus(db, run.id, "completed", {
      actualJson: canonicalJson(
        await actualUsage(db, runId, target, estimate, startedAt, deps.now()),
      ),
      coverageJson: canonicalJson(coverage),
      completedAt: testedAt,
    });
  } catch (error) {
    if (error instanceof RunCancelled) {
      await setRunStatus(db, run.id, "cancelled", {
        completedAt: nowIso(),
      });

      return;
    }

    const failure =
      error instanceof RunFailure
        ? error
        : new RunFailure(
            "probe_error",
            error instanceof Error ? error.message : "The identity run failed.",
          );

    await failRun(db, run, failure, nowIso());
  }
}
