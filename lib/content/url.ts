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

import { isIP } from "node:net";

const PRIVATE_V4 =
  /^(0|10|127|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])|2(2[4-9]|[3-5]\d)|255)\./;

function ipv4Number(part: string): number | null {
  if (/^0x[0-9a-f]+$/i.test(part)) return Number.parseInt(part, 16);
  if (/^0[0-7]+$/.test(part)) return Number.parseInt(part, 8);
  if (/^\d+$/.test(part)) return Number(part);

  return null;
}

/** Normalizes decimal, hex, octal and shortened IPv4 forms to a dotted quad. */
function normalizeIpv4(host: string): string | null {
  const parts = host.split(".");

  if (parts.length < 1 || parts.length > 4) return null;

  const numbers = parts.map(ipv4Number);

  if (numbers.some((value) => value === null)) return null;

  const last = numbers[numbers.length - 1] as number;
  const lastMax = 256 ** (4 - parts.length + 1) - 1;

  if (last > lastMax) return null;

  let value = last;

  for (let index = parts.length - 2; index >= 0; index -= 1) {
    const part = numbers[index] as number;

    if (part > 255) return null;
    value += part * 256 ** (3 - index);
  }

  return [24, 16, 8, 0]
    .map((shift) => Math.floor(value / 2 ** shift) % 256)
    .join(".");
}

function ipv4IsPrivate(dotted: string): boolean {
  return PRIVATE_V4.test(`${dotted}.`);
}

function ipv6IsPrivate(host: string): boolean {
  const text = host.toLowerCase();

  if (text === "::" || text === "::1") return true;
  if (/^f[cd]/.test(text) || /^fe[89ab]/.test(text) || /^ff/.test(text)) {
    return true;
  }

  const mapped = text.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);

  if (mapped) return ipv4IsPrivate(mapped[1]);

  const words = text.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);

  if (!words) return false;

  const value =
    Number.parseInt(words[1], 16) * 65_536 + Number.parseInt(words[2], 16);

  return ipv4IsPrivate(
    [24, 16, 8, 0]
      .map((shift) => Math.floor(value / 2 ** shift) % 256)
      .join("."),
  );
}

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

  const host = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/%2e/gi, ".");

  if (!host) return { ok: false, error: "The source URL has no host." };

  if (BLOCKED_HOSTS.has(host) || host.endsWith(".local")) {
    return { ok: false, error: "Local and link-local hosts are not allowed." };
  }

  const ipVersion = isIP(host);

  if (ipVersion === 4 && ipv4IsPrivate(host)) {
    return {
      ok: false,
      error: "Private and link-local addresses are not allowed.",
    };
  }

  if (ipVersion === 6 && ipv6IsPrivate(host)) {
    return {
      ok: false,
      error: "Private and link-local addresses are not allowed.",
    };
  }

  if (ipVersion === 0) {
    const numeric = normalizeIpv4(host);

    if (numeric && ipv4IsPrivate(numeric)) {
      return {
        ok: false,
        error: "Private and link-local addresses are not allowed.",
      };
    }
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
