import "server-only";

import type { ProviderRecord } from "./types";

import {
  anthropicStream,
  toAnthropicRequest,
  toOpenAiCompletion,
} from "./anthropic-translate";
import { providerFetch } from "./request";

export async function anthropicMessages(
  provider: ProviderRecord,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  const response = await providerFetch(provider, "/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toAnthropicRequest(body)),
    signal,
  });

  if (!response.ok) return response;

  if (body.stream === true) {
    if (!response.body) return response;

    return new Response(anthropicStream(response.body), {
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    });
  }

  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!payload) {
    return Response.json(
      {
        error: {
          message: "Provider returned an invalid response",
          type: "upstream_error",
        },
      },
      { status: 502 },
    );
  }

  return Response.json(toOpenAiCompletion(payload, String(body.model ?? "")), {
    status: 200,
  });
}
