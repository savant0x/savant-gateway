import "server-only";

import { getModelByUpstreamId, getModelForGateway } from "./store";

// The pure refusals live in one place so the PostgreSQL entry can share them
// without importing this synchronous module (FID-086, gateway port).
export {
  failureStatus,
  isFreeCall,
  retryHeaders,
  safeUpstreamMessage,
} from "./gateway-refusal";

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
