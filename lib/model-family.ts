import { publisherFromModelId } from "./model-identity.ts";

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

/**
 * Family prefixes a marketplace id does not spell the same way twice.
 *
 * `mm/MiniMax-M3` and `cb/minimax-m3` are one line, `kcai/k3.1-pro` is Kimi,
 * `zai/glm-5.3` is GLM and `qwen3.8` is Qwen. Exact labels are consulted first,
 * so a prefix can never shadow a declared family like `gpt`.
 */
const FAMILY_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["qwen", "Qwen"],
  ["hy4", "Hy4"],
  ["minimax", "MiniMax"],
  ["zai", "GLM"],
  ["k3", "Kimi"],
];

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

/**
 * Derives the model family from an upstream id. The `free/` prefix is the
 * provider's price-group scope and a marketplace prefix is a publisher, so the
 * family comes from the **leaf**: `free/gpt-6-luna` and `cc/claude-opus-5-5` are
 * GPT and Claude, never "Free" or "Cc".
 */
export function familyFromModelId(modelId: string) {
  const leaf = leafId(modelId);
  const segment = leaf.split("-")[0]?.trim().toLowerCase() ?? "";
  const exact = FAMILY_LABELS[segment];

  if (exact) return exact;

  const prefix = FAMILY_PREFIXES.find(([value]) => segment.startsWith(value));

  if (prefix) return prefix[1];

  return titleCase(leaf.split("-")[0] ?? "") || "Other";
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

  const publisher = publisherFromModelId(modelId, null);

  if (publisher && trimmed.toLowerCase() === publisher.toLowerCase()) {
    return familyFromModelId(modelId);
  }

  return trimmed;
}
