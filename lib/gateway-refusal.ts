/**
 * The gateway's refusals, separated from how a model is looked up.
 *
 * These helpers were part of `lib/gateway-resolution.ts`, which imports the
 * synchronous store. The PostgreSQL entry needs the same answers without that
 * dependency, and copying them would have created two definitions of which
 * upstream status may be passed through to a customer.
 */

/**
 * A provider's own text is only shown when it describes the customer's request.
 * A 5xx, 401, 403 or 402 is the provider's problem — telling a customer "invalid
 * API key" when it is ours, or passing on an upstream's "deposit funds" notice,
 * would send them looking for a fix they cannot make.
 */
export function safeUpstreamMessage(status: number, message: string) {
  if (status === 402) return "Provider is temporarily unavailable";
  if (status >= 500 || status === 401 || status === 403) {
    return "Provider request failed";
  }

  return message || "Provider request failed";
}

/**
 * Only a status that names the customer's request survives the relay. An
 * upstream 402 means our account with that provider cannot pay, which is an
 * outage to us and never the customer's missing credit: our own 402 is emitted
 * by the credit path, so an upstream one must not borrow it.
 */
export function failureStatus(status: number) {
  if (status === 402) return 503;

  return status === 400 || status === 429 ? status : 502;
}

export function retryHeaders(upstream: Response): Record<string, string> {
  const retryAfter = upstream.headers.get("retry-after");

  if (!retryAfter) return {};

  return { "Retry-After": retryAfter };
}
