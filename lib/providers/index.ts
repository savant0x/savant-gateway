import "server-only";

import type { GatewayModel } from "../store/shared";

import { getProvider } from "../store/providers";

import { anthropicMessages } from "./anthropic";
import { openAiChat } from "./openai";
import { ProviderConfigError } from "./request";

export async function callProvider(
  model: GatewayModel,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  const provider = getProvider(model.upstreamSlug);

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
