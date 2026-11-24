import type { ModelProtocol, ProviderKind } from "./types";

export const DEFAULT_PROVIDER_SLUG = "savant";
/** Kept for the seeds and for a registry that has no row to name. Which row owns
 *  the public namespace is `providers.is_default`; see `lib/storage/store/providers.ts`. */
export const PROVIDER_KINDS: ProviderKind[] = ["openai", "anthropic", "both"];

export type ProviderInput = {
  slug: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  keyEnvVar: string;
  defaultHeaders: Record<string, string>;
  capabilities: { balance: boolean; subscription: boolean; pricing: boolean };
  /** Whether the provider's terms allow reselling free-pool ids. */
  resaleFreePool: boolean;
  /** Absolute balance URL when the provider publishes it off-base; null = default. */
  balanceUrl: string | null;
  catalogUrl: string | null;
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

function parseProviderUrl(value: string): URL | null {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * An optional absolute URL a provider publishes outside its inference base URL
 * (`balanceUrl`, `catalogUrl`). It is fetched with the provider's own credential,
 * so it is held to the same rules as the base URL: http(s) only and no embedded
 * credentials. One validator serves both fields, so they cannot drift apart.
 */
function parseOptionalProviderUrl(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null } as const;
  }

  if (typeof value !== "string") {
    return { ok: false, error: `${field} must be a URL or empty.` } as const;
  }

  const trimmed = value.trim();

  if (!trimmed) return { ok: true, value: null } as const;

  const url = parseProviderUrl(trimmed);

  if (!url) {
    return { ok: false, error: `${field} must be an http(s) URL.` } as const;
  }

  if (url.username || url.password) {
    return {
      ok: false,
      error: `${field} must not contain credentials.`,
    } as const;
  }

  return { ok: true, value: url.toString() } as const;
}

/** The balance read may live on another host than the inference base URL. */
function parseBalanceUrl(value: unknown) {
  return parseOptionalProviderUrl(value, "balanceUrl");
}

/** The vendor's prefix-group document may live on another host too. */
function parseCatalogUrl(value: unknown) {
  return parseOptionalProviderUrl(value, "catalogUrl");
}

/**
 * Validates an admin provider record. Credentials are never accepted here:
 * the record names the environment variable that holds the key, and the URL
 * must not smuggle a second credential that would be sent to the upstream and
 * could appear in a diagnostics string.
 */
/**
 * The rejection message for a key name that is not a name.
 *
 * The field takes a variable name, never the secret. An operator holding a key
 * in the clipboard pastes it where it fits, so the message has to say that the
 * value is not wrong — only misplaced — and where it belongs instead.
 */
export function keyEnvVarError(value: string) {
  const looksLikeSecret =
    value.length >= 20 && !ENV_VAR.test(value) && /[a-z-]/.test(value);

  if (looksLikeSecret) {
    return (
      "That is the key value itself, not a variable name. This field takes the " +
      "variable name, for example INFERHUB_API_KEY; put the value in " +
      ".env.local and restart the runtime."
    );
  }

  return "keyEnvVar must be an upper-snake-case environment variable name.";
}

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

  const parsedBaseUrl = parseProviderUrl(baseUrl);

  if (!parsedBaseUrl) {
    return { ok: false, error: "baseUrl must be an http(s) URL." } as const;
  }

  if (parsedBaseUrl.username || parsedBaseUrl.password) {
    return {
      ok: false,
      error:
        "baseUrl must not contain credentials; store the key in keyEnvVar.",
    } as const;
  }

  if (!ENV_VAR.test(keyEnvVar)) {
    return { ok: false, error: keyEnvVarError(keyEnvVar) } as const;
  }

  const headers = parseDefaultHeaders(input.defaultHeaders);

  if (!headers.ok) return headers;

  const balanceUrl = parseBalanceUrl(input.balanceUrl);

  if (!balanceUrl.ok) return balanceUrl;

  const catalogUrl = parseCatalogUrl(input.catalogUrl);

  if (!catalogUrl.ok) return catalogUrl;

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
      resaleFreePool: input.resaleFreePool !== false,
      balanceUrl: balanceUrl.value,
      catalogUrl: catalogUrl.value,
      sortOrder:
        typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
          ? Math.round(input.sortOrder)
          : 0,
    } satisfies ProviderInput,
  } as const;
}

/**
 * The published id for one upstream model.
 *
 * The default provider owns the unprefixed namespace, so its rows keep the bare
 * upstream id and every other provider's rows are namespaced as `slug/id`. The
 * owner is passed in rather than read from a constant: it is one stored fact and
 * an operator can move it (FID-2026-1124-002).
 */
export function publicModelId(
  defaultSlug: string | null,
  providerSlug: string,
  upstreamId: string,
) {
  return defaultSlug === providerSlug
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

export type ProviderReadinessState = "ready" | "disabled" | "blocked";

export type ProviderReadiness = {
  state: ProviderReadinessState;
  configured: boolean;
  /** Secret-free explanation when the provider claims to be enabled. */
  reason: string | null;
};

/**
 * Whether this runtime can actually serve a provider. Enabled plus a visible
 * non-blank key is the only ready state; a missing key on an enabled record is
 * blocked, not merely unconfigured, because the record currently claims service
 * it cannot provide. A disabled provider is never blocked: it is not claiming
 * anything, so a missing key is ordinary preparation.
 */
export function providerReadiness(input: {
  keyEnvVar: string;
  enabled: boolean;
  env?: Record<string, string | undefined>;
}): ProviderReadiness {
  const name = input.keyEnvVar.trim();
  const configured = name !== "" && providerKeyConfigured(name, input.env);

  if (configured) {
    return {
      state: input.enabled ? "ready" : "disabled",
      configured: true,
      reason: null,
    };
  }

  if (!input.enabled) {
    return { state: "disabled", configured: false, reason: null };
  }

  return {
    state: "blocked",
    configured: false,
    reason: name
      ? `${name} is not set in this runtime.`
      : "No key environment variable is recorded.",
  };
}

/**
 * The operator-facing refusal for a save that would leave a provider enabled
 * without a visible key. Null means the save is admissible.
 */
export function providerEnableRefusal(input: {
  label: string;
  keyEnvVar: string;
  enabled: boolean;
  env?: Record<string, string | undefined>;
}): string | null {
  const readiness = providerReadiness(input);

  if (readiness.state !== "blocked") return null;

  const name = input.label.trim() || "This provider";

  return (
    `Cannot enable ${name}: ${readiness.reason} ` +
    "Set the variable for this environment and restart or redeploy, or keep the provider disabled."
  );
}
