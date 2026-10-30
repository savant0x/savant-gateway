import "server-only";

import type { GatewayModel } from "./store";

import { getModelByUpstreamId, getModelForGateway } from "./store";

export function resolveModel(publicId: string) {
  const exact = getModelForGateway(publicId);

  if (exact) return exact;

  const candidates: string[] = [];

  if (publicId.startsWith("free-"))
    candidates.push(`free/${publicId.slice(5)}`);
  if (publicId.endsWith("-free"))
    candidates.push(`free/${publicId.slice(0, -5)}`);

  if (!publicId.includes("/")) {
    const dash = publicId.indexOf("-");

    if (dash > 0)
      candidates.push(`${publicId.slice(0, dash)}/${publicId.slice(dash + 1)}`);
  }

  for (const candidate of candidates) {
    const model = getModelForGateway(candidate);

    if (model) return model;
  }

  return getModelByUpstreamId(publicId);
}

export function isFreeCall(model: GatewayModel) {
  return model.billingMode === "free";
}

export function safeUpstreamMessage(status: number, message: string) {
  if (status >= 500 || status === 401 || status === 403)
    return "Provider request failed";

  return message || "Provider request failed";
}

export function failureStatus(status: number) {
  return status === 400 || status === 402 || status === 429 ? status : 502;
}

export function retryHeaders(upstream: Response): Record<string, string> {
  const retryAfter = upstream.headers.get("retry-after");

  if (!retryAfter) return {};

  return { "Retry-After": retryAfter };
}
