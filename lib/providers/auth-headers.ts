import type { ProviderKind } from "./types";

/**
 * Upstream auth headers per wire format. A provider that serves both formats
 * gets both credentials: OpenAI-compatible routes read `Authorization`, and
 * Anthropic-compatible routes read `x-api-key`, so a shared base URL works
 * without asking the operator which route the model will take.
 */
export function authHeaders(
  kind: ProviderKind,
  key: string,
  defaults: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    ...defaults,
    Accept: "application/json",
  };

  if (kind === "anthropic" || kind === "both") {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
  }

  if (kind === "openai" || kind === "both") {
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
}
