import type { SourceInput } from "./store/sources.ts";
import type { SourceKind } from "./types.ts";

import { parseFilterTermInput, parseTagInput } from "./taxonomy.ts";
import { SOURCE_KINDS } from "./types.ts";
import { clampIntervalMinutes, clampMaxItems } from "./url.ts";

export type SourceBodyResult =
  { ok: true; value: SourceInput } | { ok: false; error: string };

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];

  return typeof value === "string" ? value.trim() : "";
}

/** Parses the operator JSON body; the store performs the URL policy check. */
export function parseSourceBody(
  body: Record<string, unknown>,
): SourceBodyResult {
  const kind = stringField(body, "kind");

  if (!SOURCE_KINDS.includes(kind as SourceKind)) {
    return {
      ok: false,
      error: `kind must be one of ${SOURCE_KINDS.join(", ")}.`,
    };
  }

  const label = stringField(body, "label");
  const url = stringField(body, "url");

  if (!label || label.length > 120) {
    return { ok: false, error: "A label of 1–120 characters is required." };
  }

  if (!url) return { ok: false, error: "A source URL is required." };

  const tags = parseTagInput(stringField(body, "tags"));
  const channelId = stringField(body, "channelId");
  const includeTerms = parseFilterTermInput(stringField(body, "includeTerms"));
  const excludeTerms = parseFilterTermInput(stringField(body, "excludeTerms"));
  const enabled = body.enabled !== false;

  return {
    ok: true,
    value: {
      kind: kind as SourceKind,
      label,
      url,
      config: {
        tags,
        ...(channelId ? { channelId } : {}),
        ...(includeTerms.length > 0 ? { includeTerms } : {}),
        ...(excludeTerms.length > 0 ? { excludeTerms } : {}),
      },
      enabled,
      fetchIntervalMinutes: clampIntervalMinutes(body.fetchIntervalMinutes),
      maxItems: clampMaxItems(body.maxItems),
    },
  };
}
