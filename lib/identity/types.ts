/** Shared model-identity verification shapes (FID-2026-1101-087). */

export type IdentityRunMode = "baseline" | "verify";

export type IdentityRunStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";

export type IdentityArm = "target" | "diff_control";

export type IdentityVerdictStatus =
  | "baseline"
  | "self_consistent"
  | "consistent"
  | "inconclusive"
  | "divergent_review"
  | "mismatch_confirmed"
  | "unsupported"
  | "stale"
  | "error";

export type IdentityFindingState =
  "pass" | "fail" | "inconclusive" | "not_tested" | "suspect";

export type IdentityProviderKind = "openai" | "anthropic" | "both";

export type IdentityProtocolRecord = {
  id: string;
  version: string;
  probeSha256: string;
  systemPromptSha256: string;
  batteryJson: string;
  samplingJson: string;
  normalizerVersion: string;
  sealedAt: string;
};

export type IdentityProviderSnapshot = {
  slug: string;
  kind: IdentityProviderKind;
  baseUrl: string;
  keyEnvVar: string;
};

export type IdentityTarget = {
  modelId: string;
  name: string;
  canonicalKey: string;
  providerSlug: string;
  upstreamId: string;
  protocol: "chat" | "messages";
  family: string;
  contextWindow: string;
  access: "free" | "paid" | "subscription";
  supportsTools: boolean;
  costInputMicros: number;
  costOutputMicros: number;
  tokenWeight: number;
};

export type IdentityControlSnapshot = {
  target: IdentityTarget;
  provider: IdentityProviderSnapshot;
};

export type IdentityCellCounts = {
  n: number;
  counts: Record<string, number>;
};

export type IdentityCounts = {
  cells: Record<string, IdentityCellCounts>;
};

export type IdentityReferenceRecord = {
  id: string;
  canonicalModelKey: string;
  protocolId: string;
  providerSlug: string;
  upstreamId: string;
  collectedAt: string;
  expiresAt: string;
  countsJson: string;
  nPerCell: number;
  contentSha256: string;
  runId: string | null;
};

export type IdentityRunRecord = {
  id: string;
  targetModelId: string;
  targetName: string;
  canonicalModelKey: string;
  providerSlug: string;
  upstreamId: string;
  targetJson: string;
  providerJson: string;
  protocolId: string;
  referenceId: string | null;
  controlModelId: string | null;
  controlProviderSlug: string | null;
  controlUpstreamId: string | null;
  controlJson: string | null;
  mode: IdentityRunMode;
  status: IdentityRunStatus;
  cancelRequested: number;
  estimateJson: string;
  actualJson: string | null;
  coverageJson: string | null;
  errorClass: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type IdentitySampleRecord = {
  id: string;
  runId: string;
  probeId: string;
  arm: IdentityArm;
  iteration: number;
  httpStatus: number;
  modelField: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  responseSha256: string;
  responseExcerpt: string;
  topLogprobsJson: string | null;
  latencyMs: number | null;
  errorClass: string | null;
  createdAt: string;
};

export type IdentityFindingRecord = {
  id: string;
  runId: string;
  class: string;
  metric: string;
  observed: string | null;
  threshold: string | null;
  n: number;
  state: IdentityFindingState;
  evidenceJson: string;
  createdAt: string;
};

export type IdentityVerdictRecord = {
  id: string;
  runId: string;
  targetModelId: string;
  status: IdentityVerdictStatus;
  summary: string;
  claimsJson: string;
  limitsJson: string;
  coverageJson: string;
  testedAt: string;
  validUntil: string;
  published: number;
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: string;
};

export type IdentityCorrectionRecord = {
  id: string;
  targetModelId: string;
  runId: string | null;
  statusBefore: string | null;
  statusAfter: string | null;
  reason: string;
  evidenceJson: string;
  operatorNote: string;
  createdAt: string;
};

export type IdentityGateState =
  "pass" | "fail" | "inconclusive" | "not_tested" | "suspect";

export type IdentityGateCoverage = {
  state: IdentityGateState;
  n: number;
  note: string | null;
};

export type IdentityFingerprintCoverage = {
  state: "consistent" | "divergent" | "inconclusive";
  comparableCells: number;
  meanJsd: number | null;
  noise: number | null;
  lower: number | null;
  upper: number | null;
  referenceProvider: "same" | "second" | null;
  controlPresent: boolean;
  controlDiscriminative: boolean;
  controlMeanJsd: number | null;
};

export type IdentityCoverage = {
  shape: IdentityGateCoverage;
  determinism: IdentityGateCoverage;
  fingerprint: IdentityFingerprintCoverage;
  canary: IdentityGateCoverage;
  deterministic: IdentityGateCoverage;
  context: IdentityGateCoverage & { testedDepth: number | null };
  tools: IdentityGateCoverage;
  stream: IdentityGateCoverage;
  logprobs: IdentityGateCoverage;
};

export type IdentityEstimate = {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  costMicros: number;
  weightedTokens: number;
  minutes: number;
  quotaRemaining: number | null;
  quotaCheck: "reported" | "unknown";
  effectiveMode: IdentityRunMode;
  refusals: string[];
};

export type IdentityCaps = {
  maxRequestsPerModel: number;
  maxRequestsPerBatch: number;
  rpm: number;
  retentionDays: number;
  enabled: boolean;
};

export type IdentityFindingInput = {
  class: string;
  metric: string;
  state: IdentityGateState;
  n: number;
  observed: string | number | null;
  threshold: string | number | null;
  evidence: Record<string, unknown>;
};

export type IdentityVerdictResult = {
  status: IdentityVerdictStatus;
  summary: string;
  claims: string[];
  limits: string[];
  coverage: IdentityCoverage;
};

export type IdentityRunInsert = {
  protocolId: string;
  target: IdentityTarget;
  provider: IdentityProviderSnapshot;
  control: IdentityControlSnapshot | null;
  mode: IdentityRunMode;
  referenceId: string | null;
  estimate: IdentityEstimate;
  now: string;
};

export type IdentityReferenceInsert = {
  canonicalModelKey: string;
  protocolId: string;
  providerSlug: string;
  upstreamId: string;
  collectedAt: string;
  expiresAt: string;
  counts: IdentityCounts;
  runId: string | null;
};

export type IdentityPublished = {
  verdict: IdentityVerdictRecord;
  findings: IdentityFindingRecord[];
  protocolId: string;
};

export type IdentityRunDetail = {
  run: IdentityRunRecord;
  target: IdentityTarget;
  provider: IdentityProviderSnapshot;
  control: IdentityControlSnapshot | null;
  findings: IdentityFindingRecord[];
  verdict: IdentityVerdictRecord | null;
  samples: {
    target: number;
    diffControl: number;
  };
};

export type IdentityTargetSummary = {
  target: IdentityTarget;
  providerConfigured: boolean;
  lastRun: IdentityRunRecord | null;
  verdict: IdentityVerdictRecord | null;
  published: boolean;
};

export type IdentityPublishedFinding = {
  class: string;
  label: string;
  state: IdentityGateState;
  detail: string;
};

export type IdentityPublishedView = {
  modelId: string;
  status: IdentityVerdictStatus;
  statusLabel: string;
  summary: string;
  testedAt: string;
  validUntil: string;
  publishedAt: string | null;
  protocolId: string;
  claims: string[];
  limits: string[];
  findings: IdentityPublishedFinding[];
};
