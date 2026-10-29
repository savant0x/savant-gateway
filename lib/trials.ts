export type TrialConfig = {
  enabled: boolean;
  grantTokens: number;
  grantBudget: number;
  pairs: Record<string, string>;
};

function integer(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return value?.trim() && Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : fallback;
}

export function readTrialConfig(
  env: Record<string, string | undefined> = process.env,
): TrialConfig {
  const pairs: Record<string, string> = {};

  try {
    const parsed: Record<string, string> = JSON.parse(
      env.TRIAL_MODEL_PAIRS || "{}",
    );

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string" && key.trim() && value.trim()) {
          pairs[key.trim()] = value.trim();
        }
      }
    }
  } catch {
    // An invalid map enables no trial routes; never infer a paid substitute.
  }

  return {
    enabled: env.TRIAL_ENABLED === "true",
    grantTokens: integer(env.TRIAL_WEIGHTED_TOKENS, 100_000),
    grantBudget: integer(env.TRIAL_GATEWAY_GRANT_BUDGET, 0),
    pairs,
  };
}
