const FAMILY_LABELS: Record<string, string> = {
  claude: "Claude",
  deepseek: "DeepSeek",
  gemini: "Gemini",
  glm: "GLM",
  gpt: "GPT",
  grok: "Grok",
  jev: "Jev Group",
  kimi: "Kimi",
  muse: "Muse",
  qwen: "Qwen",
  tencent: "Tencent",
};

const GROUP_LABELS = new Set(["free", "paid", "subscription"]);

function titleCase(value: string) {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Derives the model family from an upstream id. The `free/` prefix is the
 * provider's price-group scope, not part of the family.
 */
export function familyFromModelId(modelId: string) {
  const scoped = modelId.startsWith("free/") ? modelId.slice(5) : modelId;
  const segment = scoped.includes("/")
    ? scoped.slice(0, scoped.indexOf("/"))
    : scoped;
  const prefix = segment.split("-")[0]?.trim().toLowerCase() ?? "";
  const fallback = titleCase(segment.split("-")[0] ?? "") || "Other";

  return FAMILY_LABELS[prefix] ?? fallback;
}

/**
 * Normalizes the provider metadata value into a family label. The upstream
 * `Free` value (and group words) are not families; derive those from the id.
 */
export function normalizeFamilyName(
  modelId: string,
  provider: string | null | undefined,
) {
  const trimmed = provider?.trim() ?? "";

  if (!trimmed || GROUP_LABELS.has(trimmed.toLowerCase())) {
    return familyFromModelId(modelId);
  }

  return trimmed;
}
