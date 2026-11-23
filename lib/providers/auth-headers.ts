import type { ProviderKind } from "./types";

/**
 * Upstream auth headers per wire format. A provider that serves both formats
 * gets both credentials: OpenAI-compatible routes read `Authorization`, and
 * Anthropic-compatible routes read `x-api-key`, so a shared base URL works
 * without asking the operator which route the model will take.
 *
 * A `null` key means "this runtime has no credential for this provider yet". The
 * catalog preview uses that to read a publicly listed catalog before the
 * operator buys a key: the credential headers are omitted, while the provider's
 * own `defaultHeaders`, `Accept` and the Anthropic wire version stay, because
 * those describe the protocol rather than the account.
 */
export function authHeaders(
  kind: ProviderKind,
  key: string | null,
  defaults: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    ...defaults,
    Accept: "application/json",
  };

  if (kind === "anthropic" || kind === "both") {
    if (key) headers["x-api-key"] = key;

    headers["anthropic-version"] = "2023-06-01";
  }

  if ((kind === "openai" || kind === "both") && key) {
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
}
