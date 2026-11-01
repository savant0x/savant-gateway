import type {
  IdentityCaps,
  IdentityEstimate,
  IdentityRunMode,
} from "./types.ts";

import {
  CONTROL_COMPLETION_TOKENS,
  CONTROL_PROMPT_TOKENS,
  CONTROL_REQUESTS,
  TARGET_COMPLETION_TOKENS,
  TARGET_MAX_REQUESTS,
  TARGET_PROMPT_TOKENS,
} from "./battery.ts";

const RETRY_HEADROOM = 1.2;

export type EstimateInput = {
  mode: IdentityRunMode;
  hasReference: boolean;
  hasControl: boolean;
  costInputMicros: number;
  costOutputMicros: number;
  tokenWeight: number;
  rpm: number;
  maxRequestsPerModel: number;
  maxRequestsPerBatch: number;
  quotaRemaining: number | null;
};

export function estimateRun(input: EstimateInput): IdentityEstimate {
  const effectiveMode: IdentityRunMode =
    input.mode === "verify" && input.hasReference ? "verify" : "baseline";
  const withControl =
    effectiveMode === "verify" && input.hasControl ? CONTROL_REQUESTS : 0;
  const controlPrompt = withControl > 0 ? CONTROL_PROMPT_TOKENS : 0;
  const controlCompletion = withControl > 0 ? CONTROL_COMPLETION_TOKENS : 0;
  const requests = Math.ceil(
    (TARGET_MAX_REQUESTS + withControl) * RETRY_HEADROOM,
  );
  const promptTokens =
    Math.round(TARGET_PROMPT_TOKENS * RETRY_HEADROOM) + controlPrompt;
  const completionTokens =
    Math.round(TARGET_COMPLETION_TOKENS * RETRY_HEADROOM) + controlCompletion;
  const costMicros = Math.round(
    (promptTokens * input.costInputMicros) / 1_000_000 +
      (completionTokens * input.costOutputMicros) / 1_000_000,
  );
  const weightedTokens =
    promptTokens + completionTokens * Math.max(1, input.tokenWeight);
  const minutes =
    Math.round((requests / Math.max(1, input.rpm)) * RETRY_HEADROOM * 10) / 10;
  const refusals: string[] = [];

  if (requests > input.maxRequestsPerModel) {
    refusals.push(
      `The run needs ${requests} requests; the per-model cap is ${input.maxRequestsPerModel}.`,
    );
  }

  if (requests > input.maxRequestsPerBatch) {
    refusals.push(
      `The run needs ${requests} requests; the batch cap is ${input.maxRequestsPerBatch}.`,
    );
  }

  if (
    input.quotaRemaining !== null &&
    input.quotaRemaining < weightedTokens * 2
  ) {
    refusals.push(
      `The provider reports ${input.quotaRemaining} weighted tokens remaining; the run requires ${weightedTokens * 2} with headroom.`,
    );
  }

  return {
    requests,
    promptTokens,
    completionTokens,
    costMicros,
    weightedTokens,
    minutes,
    quotaRemaining: input.quotaRemaining,
    quotaCheck: input.quotaRemaining === null ? "unknown" : "reported",
    effectiveMode,
    refusals,
  };
}

function positiveInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed < 1) return fallback;

  return Math.min(parsed, max);
}

export function readIdentityCaps(
  env: Record<string, string | undefined> = process.env,
): IdentityCaps {
  return {
    enabled: env.IDENTITY_ENABLED?.trim().toLowerCase() === "true",
    rpm: positiveInt(env.IDENTITY_RPM, 10, 60),
    maxRequestsPerModel: positiveInt(
      env.IDENTITY_MAX_REQUESTS_PER_MODEL,
      600,
      1_000_000,
    ),
    maxRequestsPerBatch: positiveInt(
      env.IDENTITY_MAX_REQUESTS_PER_BATCH,
      3_000,
      1_000_000,
    ),
    retentionDays: positiveInt(env.IDENTITY_SAMPLE_RETENTION_DAYS, 90, 3_650),
  };
}

const ESTIMATE_KEYS = [
  "requests",
  "promptTokens",
  "completionTokens",
  "costMicros",
  "weightedTokens",
  "minutes",
] as const;

/** Batch total for the API response; refusals are collected, not deduped. */
export function sumEstimates(estimates: IdentityEstimate[]): IdentityEstimate {
  const total: IdentityEstimate = {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    costMicros: 0,
    weightedTokens: 0,
    minutes: 0,
    quotaRemaining: null,
    quotaCheck: "reported",
    effectiveMode: "baseline",
    refusals: [],
  };

  for (const estimate of estimates) {
    for (const key of ESTIMATE_KEYS) total[key] += estimate[key];

    total.refusals.push(...estimate.refusals);

    if (estimate.quotaCheck === "unknown") total.quotaCheck = "unknown";
    if (estimate.effectiveMode === "verify") total.effectiveMode = "verify";
  }

  total.minutes = Math.round(total.minutes * 10) / 10;

  return total;
}
