import type { ModelProtocol, ProviderKind } from "./types";

export const DEFAULT_PROVIDER_SLUG = "savant";
export const PROVIDER_KINDS: ProviderKind[] = ["openai", "anthropic", "both"];

export type ProviderInput = {
  slug: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  keyEnvVar: string;
  defaultHeaders: Record<string, string>;
  capabilities: { balance: boolean; subscription: boolean; pricing: boolean };
  enabled: boolean;
  sortOrder: number;
};

const SLUG = /^[a-z0-9][a-z0-9-]{1,31}$/;
const ENV_VAR = /^[A-Z][A-Z0-9_]{1,63}$/;

export function isProviderKind(value: unknown): value is ProviderKind {
  return (
    typeof value === "string" && PROVIDER_KINDS.includes(value as ProviderKind)
  );
}

export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function parseDefaultHeaders(value: unknown) {
  if (value === undefined || value === null)
    return { ok: true, value: {} } as const;

  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "defaultHeaders must be an object." } as const;
  }

  const headers: Record<string, string> = {};

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key.trim() || typeof raw !== "string") {
      return {
        ok: false,
        error: "Every default header needs a name and a string value.",
      } as const;
    }

    headers[key.trim()] = raw;
  }

  return { ok: true, value: headers } as const;
}

/**
 * Validates an admin provider record. Credentials are never accepted here:
 * the record names the environment variable that holds the key.
 */
export function readProviderInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "A provider object is required." } as const;
  }

  const input = value as Record<string, unknown>;
  const slug = typeof input.slug === "string" ? input.slug.trim() : "";
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const baseUrl =
    typeof input.baseUrl === "string" ? normalizeBaseUrl(input.baseUrl) : "";
  const keyEnvVar =
    typeof input.keyEnvVar === "string" ? input.keyEnvVar.trim() : "";
  const kind = input.kind;

  if (!SLUG.test(slug)) {
    return {
      ok: false,
      error: "slug must be 2-32 lowercase letters, digits, or hyphens.",
    } as const;
  }

  if (!label || label.length > 60) {
    return { ok: false, error: "label must be 1-60 characters." } as const;
  }

  if (!isProviderKind(kind)) {
    return {
      ok: false,
      error: "kind must be openai, anthropic, or both.",
    } as const;
  }

  if (!/^https?:\/\/[^/\s]+/.test(baseUrl)) {
    return { ok: false, error: "baseUrl must be an http(s) URL." } as const;
  }

  if (!ENV_VAR.test(keyEnvVar)) {
    return {
      ok: false,
      error: "keyEnvVar must be an upper-snake-case environment variable name.",
    } as const;
  }

  const headers = parseDefaultHeaders(input.defaultHeaders);

  if (!headers.ok) return headers;

  const capabilities =
    input.capabilities && typeof input.capabilities === "object"
      ? (input.capabilities as Record<string, unknown>)
      : {};

  return {
    ok: true,
    value: {
      slug,
      label,
      kind,
      baseUrl,
      keyEnvVar,
      defaultHeaders: headers.value,
      capabilities: {
        balance: capabilities.balance === true,
        subscription: capabilities.subscription === true,
        pricing: capabilities.pricing === true,
      },
      enabled: input.enabled !== false,
      sortOrder:
        typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
          ? Math.round(input.sortOrder)
          : 0,
    } satisfies ProviderInput,
  } as const;
}

export function publicModelId(providerSlug: string, upstreamId: string) {
  return providerSlug === DEFAULT_PROVIDER_SLUG
    ? upstreamId
    : `${providerSlug}/${upstreamId}`;
}

function endpointList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.toLowerCase());
}

/**
 * Chooses the wire protocol per model. A provider that serves both formats
 * (CommandCode) is decided by `supported_endpoints`, then by family.
 */
export function inferModelProtocol(input: {
  kind: ProviderKind;
  upstreamId: string;
  family: string;
  supportedEndpoints?: unknown;
}): ModelProtocol | null {
  const endpoints = endpointList(input.supportedEndpoints);
  const hasChat = endpoints.some((endpoint) => endpoint.includes("chat"));
  const hasMessages = endpoints.some((endpoint) =>
    endpoint.includes("messages"),
  );

  if (endpoints.length > 0) {
    if (input.kind === "anthropic") return hasMessages ? "messages" : null;
    if (input.kind === "openai") return hasChat ? "chat" : null;

    if (hasChat && !hasMessages) return "chat";
    if (hasMessages && !hasChat) return "messages";
    if (!hasChat && !hasMessages) return null;
  }

  if (input.kind === "anthropic") return "messages";
  if (input.kind === "openai") return "chat";

  const haystack = `${input.upstreamId} ${input.family}`.toLowerCase();

  return haystack.includes("claude") || haystack.includes("anthropic")
    ? "messages"
    : "chat";
}

export function providerKeyConfigured(
  keyEnvVar: string,
  env: Record<string, string | undefined> = process.env,
) {
  return Boolean(env[keyEnvVar]?.trim());
}
