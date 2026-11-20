/**
 * Loopback-only forwarding rules for the calibration proxy
 * (FID-2026-1110-002, step 4).
 *
 * The proxy is an adversary with one declared transform, not a general relay.
 * These helpers hold the boundary rules so the server file stays a thin
 * transport: loopback binding, a loopback `Host`, no credential in a forwarded
 * header, no redirect following and no cache.
 */

export const LOOPBACK_HOSTS = [
  "127.0.0.1",
  "localhost",
  "[::1]",
  "::1",
] as const;

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const CREDENTIAL_HEADERS = new Set([
  "authorization",
  "x-api-key",
  "api-key",
  "cookie",
  "set-cookie",
  "proxy-authorization",
]);

/** `127.0.0.1:4010`, `localhost`, `[::1]:8080` are loopback; a bare name is not. */
export function isLoopbackHost(host: string | undefined | null) {
  if (!host) return false;

  const trimmed = host.trim().toLowerCase();

  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");

    if (end === -1) return false;

    const address = trimmed.slice(0, end + 1);

    return address === "[::1]";
  }

  const name = trimmed.split(":")[0] ?? "";

  return name === "127.0.0.1" || name === "localhost" || name === "::1";
}

/**
 * Headers that may cross the loopback hop. The credential, cookies, the caller's
 * `Host` and hop-by-hop framing are dropped; the server adds the credential back
 * on the upstream request only.
 */
export function sanitizeForwardHeaders(
  headers: Record<string, string | string[] | undefined>,
) {
  const forwarded: Record<string, string> = {};

  for (const [rawKey, value] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();

    if (value === undefined) continue;
    if (key === "host") continue;
    if (HOP_BY_HOP.has(key) || CREDENTIAL_HEADERS.has(key)) continue;
    if (key === "content-length") continue;

    forwarded[key] = Array.isArray(value) ? value.join(", ") : value;
  }

  return forwarded;
}

/** Joins a configured base URL and an inbound path without doubling a slash. */
export function upstreamUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;

  return `${base}${suffix}`;
}

export const PROXY_TIMEOUT_MS = 120_000;
export const MAX_PROXY_BODY_BYTES = 1_048_576;

export type ProxyRefusal =
  { ok: true } | { ok: false; status: number; reason: string };

/** Admission rules for one inbound request, before any body is read. */
export function admitProxyRequest(input: {
  host: string | undefined;
  url: string | undefined;
  method: string | undefined;
}): ProxyRefusal {
  if (!isLoopbackHost(input.host)) {
    return { ok: false, status: 403, reason: "non-loopback host" };
  }

  if (!input.url || !input.url.startsWith("/")) {
    return { ok: false, status: 400, reason: "invalid path" };
  }

  if (!input.method || !["POST", "GET"].includes(input.method)) {
    return { ok: false, status: 405, reason: "unsupported method" };
  }

  return { ok: true };
}
