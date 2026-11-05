/**
 * Versioned content-matching policy (FID-2026-1104-017).
 *
 * Matching is an operator-facing rule, not a machine review. The policy lives
 * in the existing settings authority so a change is one row with a revision.
 * Custom aliases still pass the same precision rule as catalog aliases: they
 * must contain at least two tokens, and a title or tag must contain the exact
 * contiguous sequence. They do not need a version token because the operator
 * supplied the full phrase.
 */

export const MATCHING_SETTINGS_KEY = "content.matching.policy";

export type ContentMatchingPolicy = {
  version: 1;
  revision: number;
  enabled: boolean;
  autoPublish: boolean;
  aliases: Record<string, string[]>;
};

export type MatchingParse =
  { ok: true; policy: ContentMatchingPolicy } | { ok: false; error: string };

export type MatchingSave =
  | { ok: true; policy: ContentMatchingPolicy }
  | { ok: false; status: 400 | 409; error: string };

export function defaultMatchingPolicy(): ContentMatchingPolicy {
  return {
    version: 1,
    revision: 0,
    enabled: true,
    autoPublish: false,
    aliases: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function aliasMap(value: unknown): Record<string, string[]> | string {
  if (!isRecord(value)) return "aliases must be an object keyed by model id.";

  const entries = Object.entries(value);

  if (entries.length > 200) return "aliases may cover at most 200 models.";

  const aliases: Record<string, string[]> = {};

  for (const [rawKey, rawValues] of entries) {
    const key = rawKey.trim();

    if (!key || key.length > 200) {
      return "each alias key must be a non-empty model id up to 200 characters.";
    }

    if (!Array.isArray(rawValues)) {
      return `aliases for ${key} must be an array.`;
    }

    if (rawValues.length > 10) {
      return `aliases for ${key} may contain at most 10 phrases.`;
    }

    const seen = new Set<string>();
    const values: string[] = [];

    for (const rawValue of rawValues) {
      if (typeof rawValue !== "string") {
        return `aliases for ${key} must be strings.`;
      }

      const value = rawValue.trim().replace(/\s+/g, " ");

      if (value.length < 2 || value.length > 80) {
        return `each alias for ${key} must be 2–80 characters.`;
      }

      const fingerprint = value.toLowerCase();

      if (seen.has(fingerprint)) continue;

      seen.add(fingerprint);
      values.push(value);
    }

    if (values.length > 0) aliases[key] = values;
  }

  return aliases;
}

export function parseMatchingPolicy(raw: string | null): MatchingParse {
  if (!raw) return { ok: true, policy: defaultMatchingPolicy() };

  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The matching policy row is not valid JSON." };
  }

  if (!isRecord(value)) {
    return { ok: false, error: "The matching policy row is not an object." };
  }

  if (value.version !== 1) {
    return { ok: false, error: "The matching policy version is unsupported." };
  }

  if (
    typeof value.revision !== "number" ||
    !Number.isInteger(value.revision) ||
    value.revision < 0
  ) {
    return { ok: false, error: "The matching policy revision is invalid." };
  }

  if (typeof value.autoPublish !== "boolean") {
    return { ok: false, error: "autoPublish must be a boolean." };
  }

  if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
    return { ok: false, error: "enabled must be a boolean." };
  }

  const aliases = aliasMap(value.aliases ?? {});

  if (typeof aliases === "string") return { ok: false, error: aliases };

  return {
    ok: true,
    policy: {
      version: 1,
      revision: value.revision,
      enabled: value.enabled ?? true,
      autoPublish: value.autoPublish,
      aliases,
    },
  };
}

export function validateMatchingPatch(
  policy: ContentMatchingPolicy,
  input: Record<string, unknown>,
): MatchingSave {
  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision !== policy.revision
  ) {
    return {
      ok: false,
      status: 409,
      error: "The matching policy changed since this form loaded.",
    };
  }

  let enabled = policy.enabled;

  if ("enabled" in input) {
    if (typeof input.enabled !== "boolean") {
      return { ok: false, status: 400, error: "enabled must be a boolean." };
    }

    enabled = input.enabled;
  }

  let autoPublish = policy.autoPublish;

  if ("autoPublish" in input) {
    if (typeof input.autoPublish !== "boolean") {
      return {
        ok: false,
        status: 400,
        error: "autoPublish must be a boolean.",
      };
    }

    autoPublish = input.autoPublish;
  }

  let aliases = policy.aliases;

  if ("aliases" in input) {
    const parsed = aliasMap(input.aliases);

    if (typeof parsed === "string") {
      return { ok: false, status: 400, error: parsed };
    }

    aliases = parsed;
  }

  return {
    ok: true,
    policy: { ...policy, enabled, autoPublish, aliases },
  };
}

export function formatAliasLines(aliases: Record<string, string[]>): string {
  return Object.entries(aliases)
    .map(([modelId, values]) => `${modelId} = ${values.join(" | ")}`)
    .join("\n");
}

/** Parse the operator textarea. The server re-validates the resulting object. */
export function parseAliasLines(value: string): Record<string, string[]> {
  const aliases: Record<string, string[]> = {};

  const lines = value.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");

    if (separator < 1) {
      throw new Error(`Alias line ${index + 1} needs "model.id = phrase".`);
    }

    const modelId = line.slice(0, separator).trim();
    const phrases = line
      .slice(separator + 1)
      .split("|")
      .map((phrase: string) => phrase.trim())
      .filter(Boolean);

    if (!modelId || phrases.length === 0) {
      throw new Error(`Alias line ${index + 1} is incomplete.`);
    }

    aliases[modelId] = phrases;
  }

  return aliases;
}
