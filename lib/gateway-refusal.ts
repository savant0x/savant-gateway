import type { GatewayModel } from "./projections.ts";

/**
 * The gateway's refusals, separated from how a model is looked up.
 *
 * These four helpers were part of `lib/gateway-resolution.ts`, which imports the
 * synchronous store. The PostgreSQL entry needs the same answers without that
 * dependency, and copying them would have created two definitions of what counts
 * as a free call or which upstream status may be passed through to a customer.
 */

export function isFreeCall(model: GatewayModel) {
  return model.billingMode === "free";
}

/**
 * A provider's own text is only shown when it describes the customer's request.
 * A 5xx, 401 or 403 is the provider's problem — telling a customer "invalid API
 * key" when it is ours would send them looking for the wrong fix.
 */
export function safeUpstreamMessage(status: number, message: string) {
  if (status >= 500 || status === 401 || status === 403) {
    return "Provider request failed";
  }

  return message || "Provider request failed";
}

/** Only a status that names the customer's request survives the relay. */
export function failureStatus(status: number) {
  return status === 400 || status === 402 || status === 429 ? status : 502;
}

export function retryHeaders(upstream: Response): Record<string, string> {
  const retryAfter = upstream.headers.get("retry-after");

  if (!retryAfter) return {};

  return { "Retry-After": retryAfter };
}
