import type { PostgresDatabase } from "../pg-adapter.ts";
import type { GatewayModel } from "../../projections.ts";

import { anthropicMessages } from "../../providers/anthropic.ts";
import { openAiChat } from "../../providers/openai.ts";
import { ProviderConfigError } from "../../providers/request.ts";
import { getProvider } from "../store/providers.ts";

/**
 * Provider dispatch on the async handle.
 *
 * `lib/providers/index.ts` read the provider from the synchronous registry. The
 * only change here is that lookup; the adapters, the credential handling and the
 * protocol choice are the same modules. A disabled provider is a
 * `ProviderConfigError` rather than a 503 because the gateway has already
 * checked `enabled` during routing — reaching this with a disabled provider means
 * the row changed underneath the request, which is a configuration error worth
 * surfacing as one.
 */
export async function callProvider(
  db: PostgresDatabase,
  model: GatewayModel,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  const provider = await getProvider(db, model.upstreamSlug);

  if (!provider) {
    throw new ProviderConfigError(`Unknown provider: ${model.upstreamSlug}`);
  }

  if (!provider.enabled) {
    throw new ProviderConfigError(`Provider ${provider.label} is disabled.`);
  }

  return model.protocol === "messages"
    ? anthropicMessages(provider, body, signal)
    : openAiChat(provider, body, signal);
}
