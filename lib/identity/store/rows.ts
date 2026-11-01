import type {
  IdentityArm,
  IdentityCorrectionRecord,
  IdentityFindingRecord,
  IdentityProtocolRecord,
  IdentityReferenceRecord,
  IdentityRunRecord,
  IdentityRunStatus,
  IdentitySampleRecord,
  IdentityVerdictRecord,
  IdentityVerdictStatus,
} from "../types.ts";

export type ProtocolRow = {
  id: string;
  version: string;
  probe_sha256: string;
  system_prompt_sha256: string;
  battery_json: string;
  sampling_json: string;
  normalizer_version: string;
  sealed_at: string;
};

export type RunRow = {
  id: string;
  target_model_id: string;
  target_name: string;
  canonical_model_key: string;
  provider_slug: string;
  upstream_id: string;
  target_json: string;
  provider_json: string;
  protocol_id: string;
  reference_id: string | null;
  control_model_id: string | null;
  control_provider_slug: string | null;
  control_upstream_id: string | null;
  control_json: string | null;
  mode: "baseline" | "verify";
  status: IdentityRunStatus;
  cancel_requested: number;
  estimate_json: string;
  actual_json: string | null;
  coverage_json: string | null;
  error_class: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type SampleRow = {
  id: string;
  run_id: string;
  probe_id: string;
  arm: IdentityArm;
  iteration: number;
  http_status: number;
  model_field: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  response_sha256: string;
  response_excerpt: string;
  top_logprobs_json: string | null;
  latency_ms: number | null;
  error_class: string | null;
  created_at: string;
};

export type FindingRow = {
  id: string;
  run_id: string;
  class: string;
  metric: string;
  observed: string | null;
  threshold: string | null;
  n: number;
  state: IdentityFindingRecord["state"];
  evidence_json: string;
  created_at: string;
};

export type VerdictRow = {
  id: string;
  run_id: string;
  target_model_id: string;
  status: IdentityVerdictStatus;
  summary: string;
  claims_json: string;
  limits_json: string;
  coverage_json: string;
  tested_at: string;
  valid_until: string;
  published: number;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
};

export type CorrectionRow = {
  id: string;
  target_model_id: string;
  run_id: string | null;
  status_before: string | null;
  status_after: string | null;
  reason: string;
  evidence_json: string;
  operator_note: string;
  created_at: string;
};

export type ReferenceRow = {
  id: string;
  canonical_model_key: string;
  protocol_id: string;
  provider_slug: string;
  upstream_id: string;
  collected_at: string;
  expires_at: string;
  counts_json: string;
  n_per_cell: number;
  content_sha256: string;
  run_id: string | null;
};

export function toProtocol(row: ProtocolRow): IdentityProtocolRecord {
  return {
    id: row.id,
    version: row.version,
    probeSha256: row.probe_sha256,
    systemPromptSha256: row.system_prompt_sha256,
    batteryJson: row.battery_json,
    samplingJson: row.sampling_json,
    normalizerVersion: row.normalizer_version,
    sealedAt: row.sealed_at,
  };
}

export function toRun(row: RunRow): IdentityRunRecord {
  return {
    id: row.id,
    targetModelId: row.target_model_id,
    targetName: row.target_name,
    canonicalModelKey: row.canonical_model_key,
    providerSlug: row.provider_slug,
    upstreamId: row.upstream_id,
    targetJson: row.target_json,
    providerJson: row.provider_json,
    protocolId: row.protocol_id,
    referenceId: row.reference_id,
    controlModelId: row.control_model_id,
    controlProviderSlug: row.control_provider_slug,
    controlUpstreamId: row.control_upstream_id,
    controlJson: row.control_json,
    mode: row.mode,
    status: row.status,
    cancelRequested: Number(row.cancel_requested),
    estimateJson: row.estimate_json,
    actualJson: row.actual_json,
    coverageJson: row.coverage_json,
    errorClass: row.error_class,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export function toSample(row: SampleRow): IdentitySampleRecord {
  return {
    id: row.id,
    runId: row.run_id,
    probeId: row.probe_id,
    arm: row.arm,
    iteration: Number(row.iteration),
    httpStatus: Number(row.http_status),
    modelField: row.model_field,
    promptTokens: row.prompt_tokens === null ? null : Number(row.prompt_tokens),
    completionTokens:
      row.completion_tokens === null ? null : Number(row.completion_tokens),
    responseSha256: row.response_sha256,
    responseExcerpt: row.response_excerpt,
    topLogprobsJson: row.top_logprobs_json,
    latencyMs: row.latency_ms === null ? null : Number(row.latency_ms),
    errorClass: row.error_class,
    createdAt: row.created_at,
  };
}

export function toFinding(row: FindingRow): IdentityFindingRecord {
  return {
    id: row.id,
    runId: row.run_id,
    class: row.class,
    metric: row.metric,
    observed: row.observed,
    threshold: row.threshold,
    n: Number(row.n),
    state: row.state,
    evidenceJson: row.evidence_json,
    createdAt: row.created_at,
  };
}

export function toVerdict(row: VerdictRow): IdentityVerdictRecord {
  return {
    id: row.id,
    runId: row.run_id,
    targetModelId: row.target_model_id,
    status: row.status,
    summary: row.summary,
    claimsJson: row.claims_json,
    limitsJson: row.limits_json,
    coverageJson: row.coverage_json,
    testedAt: row.tested_at,
    validUntil: row.valid_until,
    published: Number(row.published),
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    createdAt: row.created_at,
  };
}

export function toCorrection(row: CorrectionRow): IdentityCorrectionRecord {
  return {
    id: row.id,
    targetModelId: row.target_model_id,
    runId: row.run_id,
    statusBefore: row.status_before,
    statusAfter: row.status_after,
    reason: row.reason,
    evidenceJson: row.evidence_json,
    operatorNote: row.operator_note,
    createdAt: row.created_at,
  };
}

export function toReference(row: ReferenceRow): IdentityReferenceRecord {
  return {
    id: row.id,
    canonicalModelKey: row.canonical_model_key,
    protocolId: row.protocol_id,
    providerSlug: row.provider_slug,
    upstreamId: row.upstream_id,
    collectedAt: row.collected_at,
    expiresAt: row.expires_at,
    countsJson: row.counts_json,
    nPerCell: Number(row.n_per_cell),
    contentSha256: row.content_sha256,
    runId: row.run_id,
  };
}

export function limitValue(limit: number, max: number) {
  return Math.min(Math.max(Math.floor(limit), 1), max);
}
