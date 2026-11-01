import type {
  IdentityFindingRecord,
  IdentityGateState,
  IdentityPublishedFinding,
  IdentityPublishedView,
  IdentityVerdictRecord,
  IdentityVerdictStatus,
} from "./types.ts";

import { DECISION, FINGERPRINT_SAMPLES, PROTOCOL_ID } from "./battery.ts";

export const STATUS_LABELS: Record<IdentityVerdictStatus, string> = {
  baseline: "Baseline collected",
  self_consistent: "Self-consistent",
  consistent: "Consistent with reference",
  inconclusive: "Inconclusive",
  divergent_review: "Under review",
  mismatch_confirmed: "Mismatch confirmed",
  unsupported: "Not testable",
  stale: "Stale",
  error: "Check failed",
};

export const STATUS_COPY: Record<IdentityVerdictStatus, string> = {
  baseline:
    "A response baseline was collected on {date}. No protocol-matched reference has been compared yet, so model identity is not independently verified.",
  self_consistent:
    "The route's response distribution was stable against its own stored baseline on {n} probe cells ({samples} samples per cell), tested {date}. This does not independently verify the model identity.",
  consistent:
    "Behavioral response distributions were consistent with the stored second-provider reference on {n} probe cells, tested {date}. This is an advisory result, not a guarantee of model weights.",
  inconclusive:
    "The check did not produce a conclusive result: {reason}. No identity claim is made.",
  divergent_review:
    "A difference from the stored reference was measured on {date}. It is under operator review and is not a finding.",
  mismatch_confirmed:
    "The operator confirmed a mismatch on {date}. See the correction ledger.",
  unsupported:
    "No trusted reference or baseline exists for this route. Identity is not testable.",
  stale:
    "The last check is older than {days} days. The previous result is no longer current.",
  error: "The last check failed. No current identity result is available.",
};

export const FINDING_LABELS: Record<string, string> = {
  shape: "Protocol shape",
  determinism: "Determinism",
  fingerprint: "Response distribution",
  canary: "Canary leakage",
  deterministic: "Deterministic canaries",
  context: "Context retrieval",
  tools: "Tool conformance",
  stream: "Stream integrity",
  logprobs: "Logprobs",
  cache: "Replay screen",
};

export const PROHIBITED_PUBLIC_WORDS = [
  "authentic",
  "genuine",
  "proven",
  "certified",
  "unquantized",
  "100%",
] as const;

export type CopyParams = {
  date?: string;
  n?: number;
  samples?: number;
  reason?: string;
  days?: number;
};

function fill(template: string, params: CopyParams) {
  return template
    .replace("{date}", params.date ?? "the test date")
    .replace("{n}", String(params.n ?? 0))
    .replace("{samples}", String(params.samples ?? FINGERPRINT_SAMPLES))
    .replace(
      "{reason}",
      params.reason ?? "the measured evidence was insufficient",
    )
    .replace("{days}", String(params.days ?? DECISION.ttlDays));
}

export function verdictSummary(
  status: IdentityVerdictStatus,
  params: CopyParams = {},
) {
  return fill(STATUS_COPY[status], params);
}

export function statusLabel(status: IdentityVerdictStatus) {
  return STATUS_LABELS[status];
}

export function findingLabel(className: string) {
  return FINDING_LABELS[className] ?? className;
}

export function containsProhibitedPublicWord(value: string) {
  const lower = value.toLowerCase();

  return PROHIBITED_PUBLIC_WORDS.some((word) => lower.includes(word));
}

function readJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function evidenceOf(finding: IdentityFindingRecord) {
  return readJson<Record<string, unknown>>(finding.evidenceJson, {});
}

function numberFrom(evidence: Record<string, unknown>, key: string) {
  const value = Number(evidence[key]);

  return Number.isFinite(value) ? value : null;
}

function findingDetail(finding: IdentityFindingRecord) {
  const evidence = evidenceOf(finding);
  const n = finding.n;

  if (finding.state === "not_tested") return "Not tested.";

  if (finding.state === "suspect") {
    return "The response pattern is consistent with replay; this is descriptive only.";
  }

  if (finding.state === "inconclusive") {
    return `Inconclusive on ${n} probes; no identity claim is made.`;
  }

  const failed = finding.state === "fail";

  switch (finding.class) {
    case "canary":
      return failed
        ? `The route revealed the canary phrase on ${n} probes. This is a behavior finding, not evidence of a hidden system prompt.`
        : `No canary leakage was detected in ${n} probes; this does not prove the absence of a hidden system prompt.`;
    case "context": {
      const depth = numberFrom(evidence, "testedDepth");
      const advertised = String(evidence.advertised ?? "the advertised window");

      return failed
        ? `Context retrieval failed at ${depth ?? "a tested"} tokens after passing at a shallower depth; this is a truncation signal.`
        : `Context retrieval passed at ${depth ?? 0} tokens of ${advertised} advertised (tested up to 8,192).`;
    }
    case "stream":
      return failed
        ? "The stream violated the protocol invariants."
        : `Streaming protocol invariants passed on ${n} streams.`;
    case "tools":
      return failed
        ? "Tool calls were malformed or rewritten."
        : `Tool calls conformed on ${n} schemas.`;
    case "determinism":
      return failed
        ? "Repeated prompts at temperature 0 did not agree after normalization."
        : `All ${n} repeated prompts agreed after normalization.`;
    case "deterministic": {
      const passed = numberFrom(evidence, "passed") ?? 0;

      return `${passed} of ${n} exact-answer canaries matched. This is corroboration, not a substitution verdict.`;
    }
    case "fingerprint":
      return failed
        ? "A distribution difference exceeded the measured noise rule; operator review is pending."
        : `Response distributions stayed within the measured noise envelope on ${n} comparable cells.`;
    case "logprobs": {
      const agreement = numberFrom(evidence, "agreement");

      return `Top-1 logprob agreement was ${agreement ?? 0} of ${n}; this is descriptive.`;
    }
    case "shape":
      return failed
        ? "The response envelope or stream shape was malformed."
        : "The response envelope and stream shape were well formed.";
    case "cache":
      return "No single-token replay pattern was observed.";
    default:
      return failed ? "The check failed." : "The check passed.";
  }
}

export type PublishedInput = {
  verdict: IdentityVerdictRecord;
  findings: IdentityFindingRecord[];
  protocolId: string;
};

/** Builds the plain-data public panel; no raw samples, JSD, or control data. */
export function publishedView(input: PublishedInput): IdentityPublishedView {
  const claims = readJson<string[]>(input.verdict.claimsJson, []);
  const limits = readJson<string[]>(input.verdict.limitsJson, []);
  const findings: IdentityPublishedFinding[] = input.findings.map(
    (finding) => ({
      class: finding.class,
      label: findingLabel(finding.class),
      state: finding.state,
      detail: findingDetail(finding),
    }),
  );

  return {
    modelId: input.verdict.targetModelId,
    status: input.verdict.status,
    statusLabel: statusLabel(input.verdict.status),
    summary: input.verdict.summary,
    testedAt: input.verdict.testedAt,
    validUntil: input.verdict.validUntil,
    publishedAt: input.verdict.publishedAt,
    protocolId: input.protocolId || PROTOCOL_ID,
    claims,
    limits,
    findings,
  };
}

export const GATE_STATE_LABELS: Record<IdentityGateState, string> = {
  pass: "passed",
  fail: "failed",
  inconclusive: "inconclusive",
  not_tested: "not tested",
  suspect: "descriptive",
};
