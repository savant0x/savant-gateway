/**
 * Byte-bounded, redirect-validated public HTTP transport (FID-2026-1104-006).
 *
 * `fetch` defaults are unsafe for an operator-supplied URL: the body is buffered
 * before a size check, `Content-Length` is not trustworthy, and redirects can
 * carry the request to loopback or a private address. This module reads the body
 * as a stream, aborts at a raw-byte cap, and follows redirects manually so every
 * hop is validated by the same public-URL policy.
 */

import { FETCH_POLICY, validatePublicHttpUrl } from "./url.ts";

export class FetchError extends Error {}

function ceilingLabel(maxBytes: number): string {
  if (maxBytes >= 1024 * 1024) {
    return `${Math.round(maxBytes / 1024 / 1024)} MiB`;
  }

  return `${maxBytes} bytes`;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type PublicResponse = {
  response: Response;
  url: string;
};

export type PublicFetchOptions = {
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRedirects?: number;
};

/**
 * Fetches a public URL without following a redirect the policy has not checked.
 * The timeout covers the whole hop chain, not each individual request.
 */
export async function fetchPublicResponse(
  rawUrl: string,
  options: PublicFetchOptions = {},
): Promise<PublicResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? FETCH_POLICY.timeoutMs;
  const maxRedirects = options.maxRedirects ?? 5;
  const signal = AbortSignal.timeout(timeoutMs);
  let current = validatePublicHttpUrl(rawUrl);

  if (!current.ok) throw new FetchError(current.error);

  for (let redirects = 0; ; redirects += 1) {
    const response = await fetchImpl(current.url.toString(), {
      headers: options.headers,
      redirect: "manual",
      signal,
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return { response, url: current.url.toString() };
    }

    const location = response.headers.get("location");

    if (!location) {
      throw new FetchError(
        `Upstream redirect (HTTP ${response.status}) did not name a destination.`,
      );
    }
    if (redirects >= maxRedirects) {
      throw new FetchError(`Upstream exceeded ${maxRedirects} redirects.`);
    }

    let next: string;

    try {
      next = new URL(location, current.url).toString();
    } catch {
      throw new FetchError("Upstream redirect named an invalid destination.");
    }

    // The response body is not needed; cancel it so the socket is not reused
    // mid-body. A failed cancel must not mask the redirect decision.
    await response.body?.cancel().catch(() => undefined);

    current = validatePublicHttpUrl(next);

    if (!current.ok) {
      throw new FetchError(`Redirect refused: ${current.error}`);
    }
  }
}

/**
 * Reads a response body as raw bytes and aborts once `maxBytes` is exceeded.
 * `Content-Length` is deliberately ignored: a dishonest value must neither
 * grant a bypass nor reject a body that is actually small.
 */
export async function readBoundedResponseBytes(
  response: Response,
  maxBytes = FETCH_POLICY.maxBytes,
  label = "Response",
): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new FetchError(
          `${label} exceeds the ${ceilingLabel(maxBytes)} response ceiling.`,
        );
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

export async function readBoundedResponseText(
  response: Response,
  maxBytes = FETCH_POLICY.maxBytes,
  label = "Response",
): Promise<string> {
  const bytes = await readBoundedResponseBytes(response, maxBytes, label);

  return new TextDecoder().decode(bytes);
}
