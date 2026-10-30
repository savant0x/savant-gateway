import { redactSecrets } from "./redaction.ts";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-api-key",
  "Access-Control-Max-Age": "86400",
} as const;

/** JSON request roots must be objects before route handlers read their fields. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Logs the operator-facing detail and returns a generic client message. Local
 * exception text must never reach a public caller; only validated 4xx input
 * errors may return specific messages.
 */
export function sanitizeError(
  scope: string,
  error: unknown,
  clientMessage = "Internal server error",
) {
  const detail =
    error instanceof Error ? (error.stack ?? error.message) : String(error);

  // One redaction policy covers logs as well as durable errors: a provider can
  // echo the credential it received inside exception text.
  // eslint-disable-next-line no-console
  console.error(`[${scope}] ${redactSecrets(detail)}`);

  return clientMessage;
}

/** The public 502 shape for a local provider-fetch failure. */
export function upstreamUnavailable(error: unknown) {
  return jsonError(
    502,
    sanitizeError(
      "gateway.provider_fetch",
      error,
      "Could not reach the provider",
    ),
    "upstream_error",
  );
}

export function jsonError(
  status: number,
  message: string,
  type = "invalid_request_error",
  extraHeaders: Record<string, string> = {},
) {
  return Response.json(
    {
      error: {
        message,
        type,
        param: null,
        code: null,
      },
    },
    { status, headers: { ...CORS_HEADERS, ...extraHeaders } },
  );
}

export function extractApiKey(request: Request) {
  const authorization = request.headers.get("authorization");

  if (authorization) {
    const [scheme, token] = authorization.split(" ");

    if (scheme?.toLowerCase() === "bearer" && token) return token.trim();
  }

  return request.headers.get("x-api-key")?.trim() || null;
}

function hostnameOf(host: string | null) {
  const value = host?.trim().toLowerCase() ?? "";

  if (value.startsWith("[")) {
    const end = value.indexOf("]");

    return end > 0 ? value.slice(1, end) : value;
  }

  return value.split(":")[0] ?? "";
}

export function isLocalRequest(request: Request) {
  const host = hostnameOf(request.headers.get("host"));

  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function localOnlyError(request: Request) {
  if (isLocalRequest(request)) return null;

  return jsonError(
    403,
    "This development-only endpoint is available on localhost only. Add your auth layer before exposing it.",
    "permission_error",
  );
}
