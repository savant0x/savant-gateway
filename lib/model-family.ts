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

function leafId(modelId: string) {
  const trimmed = modelId.trim();

  return trimmed.includes("/")
    ? trimmed.slice(trimmed.lastIndexOf("/") + 1)
    : trimmed;
}

/** The path segment a marketplace catalog puts its publisher in (`cc/`, `ag/`). */
function publisherPrefix(modelId: string) {
  const index = modelId.indexOf("/");

  return index === -1 ? "" : modelId.slice(0, index).trim().toLowerCase();
}

/**
 * Derives the model family from an upstream id. The `free/` prefix is the
 * provider's price-group scope and a marketplace prefix is a publisher, so the
 * family comes from the **leaf**: `free/gpt-6-luna` and `cc/claude-opus-5-5` are
 * GPT and Claude, never "Free" or "Cc".
 */
export function familyFromModelId(modelId: string) {
  const leaf = leafId(modelId);
  const segment = leaf.split("-")[0]?.trim().toLowerCase() ?? "";
  const fallback = titleCase(leaf.split("-")[0] ?? "") || "Other";

  return FAMILY_LABELS[segment] ?? fallback;
}

/**
 * Normalizes the provider metadata value into a family label. The upstream
 * `Free` value, group words and a bare publisher prefix are not families;
 * derive those from the id.
 */
export function normalizeFamilyName(
  modelId: string,
  provider: string | null | undefined,
) {
  const trimmed = provider?.trim() ?? "";

  if (!trimmed || GROUP_LABELS.has(trimmed.toLowerCase())) {
    return familyFromModelId(modelId);
  }

  if (trimmed.toLowerCase() === publisherPrefix(modelId)) {
    return familyFromModelId(modelId);
  }

  return trimmed;
}
