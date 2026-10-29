import "server-only";

import type { ProviderRecord } from "./types";

import { providerFetch } from "./request";

export function openAiChat(
  provider: ProviderRecord,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  return providerFetch(provider, "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}
