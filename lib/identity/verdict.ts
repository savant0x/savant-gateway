import type {
  IdentityCoverage,
  IdentityRunMode,
  IdentityVerdictResult,
  IdentityVerdictStatus,
} from "./types.ts";

import { DECISION, FINGERPRINT_SAMPLES } from "./battery.ts";
import { verdictSummary } from "./view.ts";

export type VerdictInput = {
  mode: IdentityRunMode;
  collectedBaseline: boolean;
  coverage: IdentityCoverage;
  testedAt: string;
};

function inconclusiveReason(coverage: IdentityCoverage) {
  if (coverage.determinism.state === "fail") {
    return "the route was unstable across repeated prompts";
  }

  if (coverage.fingerprint.comparableCells < DECISION.minComparableCells) {
    return "fewer than four probe cells were comparable";
  }

  if (
    coverage.fingerprint.referenceProvider === "second" &&
    !coverage.fingerprint.controlPresent
  ) {
    return "the different-model control was missing";
  }

  if (
    coverage.fingerprint.referenceProvider === "second" &&
    !coverage.fingerprint.controlDiscriminative
  ) {
    return "the different-model control did not separate";
  }

  return "the measured difference did not clear the noise rule";
}

const COMMON_LIMITS = [
  "Only the tested probes were evaluated.",
  "This is an advisory result, not a guarantee of model weights.",
];

export function decideVerdict(input: VerdictInput): IdentityVerdictResult {
  const { coverage } = input;
  const date = input.testedAt.slice(0, 10);
  const n = coverage.fingerprint.comparableCells;

  const result = (
    status: IdentityVerdictStatus,
    claims: string[],
    limits: string[],
    reason?: string,
  ): IdentityVerdictResult => ({
    status,
    summary: verdictSummary(status, {
      date,
      n,
      samples: FINGERPRINT_SAMPLES,
      days: DECISION.ttlDays,
      reason,
    }),
    claims,
    limits,
    coverage,
  });

  if (coverage.shape.state === "fail") {
    return result("error", [], ["The last check failed before a verdict."]);
  }

  const referenceProvider = coverage.fingerprint.referenceProvider;

  if (referenceProvider === null) {
    if (input.collectedBaseline) {
      return result(
        "baseline",
        ["A protocol-matched response baseline was collected."],
        [
          "No reference comparison has been made.",
          "This does not independently verify the model identity.",
        ],
      );
    }

    return result(
      "unsupported",
      [],
      ["No trusted reference or baseline exists for this route."],
    );
  }

  if (coverage.determinism.state === "fail") {
    return result(
      "inconclusive",
      [],
      COMMON_LIMITS,
      inconclusiveReason(coverage),
    );
  }

  const fingerprint = coverage.fingerprint;

  if (fingerprint.state === "divergent") {
    return result(
      "divergent_review",
      [],
      [
        "Under operator review.",
        "A measured difference is not a published finding.",
      ],
    );
  }

  if (fingerprint.state !== "consistent") {
    return result(
      "inconclusive",
      [],
      COMMON_LIMITS,
      inconclusiveReason(coverage),
    );
  }

  if (referenceProvider === "same") {
    return result(
      "self_consistent",
      ["The route was stable against its own stored baseline."],
      [
        "This does not independently verify the model identity.",
        "A same-provider reference cannot establish a second source.",
      ],
    );
  }

  if (!fingerprint.controlPresent) {
    return result(
      "inconclusive",
      [],
      COMMON_LIMITS,
      "the different-model control was missing",
    );
  }

  if (!fingerprint.controlDiscriminative) {
    return result(
      "inconclusive",
      [],
      COMMON_LIMITS,
      "the different-model control did not separate",
    );
  }

  return result(
    "consistent",
    [
      "The target matched the stored second-provider reference on the tested cells.",
      "A different-model control separated the target from another model.",
    ],
    COMMON_LIMITS,
  );
}
