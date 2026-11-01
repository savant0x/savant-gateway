import type { PostgresDatabase } from "../storage/pg-adapter.ts";
import type { ProbeProvider } from "./probe-client.ts";
import type {
  IdentityControlSnapshot,
  IdentityCounts,
  IdentityFingerprintCoverage,
  IdentityProviderSnapshot,
  IdentityRunRecord,
  IdentityTarget,
} from "./types.ts";
import type { FingerprintComparison } from "./fingerprint.ts";

import { DECISION, FINGERPRINT_SAMPLES } from "./battery.ts";
import { cacheScreen, compareFingerprint } from "./fingerprint.ts";
import { runFingerprint, type GateContext, type GateResult } from "./gates.ts";
import {
  fingerprintCoverage,
  parseSnapshot,
  plusDays,
  referenceIsValid,
  writeFinding,
} from "./runner-support.ts";
import { getReference, insertReference, selectReference } from "./store.ts";

/**
 * Reference selection and the fingerprint comparison (FID-087).
 *
 * This is the one part of a run that decides whether a stored reference is
 * trusted, whether the route is a baseline, and whether the different-model
 * control actually separated. The runner keeps the gate order; this module
 * keeps the evidence rule.
 */

export type FingerprintOutcome = {
  referenceCounts: IdentityCounts | null;
  collectedBaseline: boolean;
  coverage: IdentityFingerprintCoverage;
};

export async function evaluateFingerprint(input: {
  db: PostgresDatabase;
  run: IdentityRunRecord;
  target: IdentityTarget;
  providerSnapshot: IdentityProviderSnapshot;
  control: IdentityControlSnapshot | null;
  fingerprint: Awaited<ReturnType<typeof runFingerprint>>;
  context: GateContext;
  deps: {
    resolveProvider: (slug: string) => Promise<ProbeProvider | undefined>;
  };
  now: string;
  nowIso: () => string;
}): Promise<FingerprintOutcome> {
  const { db, run, target, providerSnapshot, control, fingerprint } = input;
  let reference = run.referenceId
    ? await getReference(db, run.referenceId)
    : null;

  if (reference && !referenceIsValid(reference, run.protocolId, input.now)) {
    reference = null;
  }

  if (!reference) {
    reference = await selectReference(db, {
      canonicalModelKey: run.canonicalModelKey,
      protocolId: run.protocolId,
      now: input.now,
      preferDifferentFrom: control ? providerSnapshot.slug : undefined,
    });
  }

  const existingReference = reference !== null;
  let collectedBaseline = false;

  if (!reference) {
    reference = await insertReference(db, {
      canonicalModelKey: run.canonicalModelKey,
      protocolId: run.protocolId,
      providerSlug: providerSnapshot.slug,
      upstreamId: target.upstreamId,
      collectedAt: input.now,
      expiresAt: plusDays(input.now, DECISION.ttlDays),
      counts: fingerprint.counts,
      runId: run.id,
    });
    collectedBaseline = true;
  }

  const referenceCounts = existingReference
    ? parseSnapshot<IdentityCounts>(reference.countsJson, "reference")
    : null;
  const referenceProvider = existingReference
    ? reference.providerSlug === providerSnapshot.slug
      ? "same"
      : "second"
    : null;
  const comparison =
    referenceCounts !== null
      ? compareFingerprint(fingerprint.counts, referenceCounts)
      : null;
  let controlComparison: FingerprintComparison | null = null;
  let controlPresent = false;

  if (
    existingReference &&
    referenceProvider === "second" &&
    control &&
    referenceCounts
  ) {
    const liveControl = await input.deps.resolveProvider(control.provider.slug);

    if (liveControl) {
      const controlContext: GateContext = {
        ...input.context,
        target: control.target,
        provider: liveControl,
      };
      const controlFingerprint = await runFingerprint(
        controlContext,
        "diff_control",
      );

      controlPresent = true;
      controlComparison = compareFingerprint(
        fingerprint.counts,
        controlFingerprint.counts,
      );
    }
  }

  const controlDiscriminative = Boolean(
    comparison &&
    controlComparison &&
    comparison.meanJsd !== null &&
    controlComparison.meanJsd !== null &&
    controlComparison.meanJsd >=
      comparison.meanJsd + DECISION.controlMultiplier * comparison.noise,
  );
  const fingerprintState = comparison
    ? comparison.state === "consistent"
      ? "pass"
      : comparison.state === "divergent"
        ? "fail"
        : "inconclusive"
    : "not_tested";
  const fingerprintResult: GateResult = {
    state: fingerprintState,
    n: comparison?.comparableCells ?? 0,
    note: existingReference
      ? comparison?.state === "divergent"
        ? "A distribution difference exceeded the measured noise rule."
        : null
      : "A baseline was collected; no reference comparison was made.",
    evidence: {
      baseline: !existingReference,
      meanJsd: comparison?.meanJsd ?? null,
      lower: comparison?.lower ?? null,
      upper: comparison?.upper ?? null,
      noise: comparison?.noise ?? null,
      comparableCells: comparison?.comparableCells ?? 0,
      referenceProvider,
      controlPresent,
      controlDiscriminative,
      controlMeanJsd: controlComparison?.meanJsd ?? null,
      sampleErrors: fingerprint.errors,
    },
  };

  await writeFinding(
    db,
    run.id,
    "fingerprint",
    "jsd",
    fingerprintResult,
    input.nowIso(),
  );

  if (referenceCounts) {
    const replay = cacheScreen(fingerprint.counts, referenceCounts);

    await writeFinding(
      db,
      run.id,
      "cache",
      "modal_share",
      {
        state: replay.suspect ? "suspect" : "pass",
        n: FINGERPRINT_SAMPLES,
        note: replay.suspect
          ? "The response pattern is consistent with replay."
          : null,
        evidence: { ...replay },
      },
      input.nowIso(),
    );
  }

  return {
    referenceCounts,
    collectedBaseline,
    coverage: fingerprintCoverage(
      comparison,
      referenceProvider,
      controlPresent,
      controlDiscriminative,
      controlComparison,
    ),
  };
}
