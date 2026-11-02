/**
 * Feed fetch policy (FID-2026-1102-088).
 *
 * The source URL is typed by an operator, but it is still untrusted input: a
 * typo pointing at `localhost` turns the gateway into a request proxy for its
 * own network. The policy is deliberately narrow — public HTTP(S), no literal
 * loopback, private, link-local, or metadata addresses, and a hard timeout.
 *
 * DNS rebinding remains possible because this layer validates the hostname
 * literal, not the resolved address. The registry is admin-only, which is the
 * compensating control recorded in FID-088.
 */

const PRIVATE_V4 =
  /^(0|10|127|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\./;

const PRIVATE_V6 = /^(::1|fc|fd|fe80|::ffff:127\.|::ffff:10\.)/i;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "instance-data",
]);

export type UrlPolicyResult =
  { ok: true; url: URL } | { ok: false; error: string };

/** Validates a source URL before any request is made. */
export function validatePublicHttpUrl(raw: string): UrlPolicyResult {
  let url: URL;

  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Enter a complete http:// or https:// URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http and https sources are supported." };
  }

  if (url.username || url.password) {
    return { ok: false, error: "Source URLs cannot contain credentials." };
  }

  if (url.port && url.port !== "80" && url.port !== "443") {
    return { ok: false, error: "Only ports 80 and 443 are allowed." };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (!host) return { ok: false, error: "The source URL has no host." };

  if (BLOCKED_HOSTS.has(host) || host.endsWith(".local")) {
    return { ok: false, error: "Local and link-local hosts are not allowed." };
  }

  if (PRIVATE_V4.test(host) || PRIVATE_V6.test(host)) {
    return {
      ok: false,
      error: "Private and link-local addresses are not allowed.",
    };
  }

  if (!host.includes(".") && !host.includes(":")) {
    return { ok: false, error: "Use a public hostname, not a bare host." };
  }

  return { ok: true, url };
}

/** Resolves a feed-relative link against the source URL and re-checks policy. */
export function resolveFeedUrl(raw: string, base: string): string | null {
  try {
    const resolved = new URL(raw, base).toString();

    return validatePublicHttpUrl(resolved).ok ? resolved : null;
  } catch {
    return null;
  }
}

export const FETCH_POLICY = {
  timeoutMs: 15_000,
  maxBytes: 2 * 1024 * 1024,
  maxItems: 50,
  minIntervalMinutes: 15,
  maxIntervalMinutes: 1_440,
  disableAfterFailures: 5,
} as const;

export function clampMaxItems(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(number)) return 20;

  return Math.min(FETCH_POLICY.maxItems, Math.max(1, Math.trunc(number)));
}

export function clampIntervalMinutes(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(number)) return 60;

  return Math.min(
    FETCH_POLICY.maxIntervalMinutes,
    Math.max(FETCH_POLICY.minIntervalMinutes, Math.trunc(number)),
  );
}
