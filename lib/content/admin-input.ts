import type { SourceInput } from "./store/sources.ts";
import type { SourceKind } from "./types.ts";

import { parseTagInput } from "./taxonomy.ts";
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

  if (kind !== "rss" && kind !== "youtube") {
    return { ok: false, error: "kind must be rss or youtube." };
  }

  const label = stringField(body, "label");
  const url = stringField(body, "url");

  if (!label || label.length > 120) {
    return { ok: false, error: "A label of 1–120 characters is required." };
  }

  if (!url) return { ok: false, error: "A source URL is required." };

  const tags = parseTagInput(stringField(body, "tags"));
  const channelId = stringField(body, "channelId");
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
      },
      enabled,
      fetchIntervalMinutes: clampIntervalMinutes(body.fetchIntervalMinutes),
      maxItems: clampMaxItems(body.maxItems),
    },
  };
}
