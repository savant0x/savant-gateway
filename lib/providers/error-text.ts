import { redactSecrets } from "../redaction.ts";

const MAX_ERROR_LENGTH = 400;

/**
 * Reads a failed provider response body into one safe diagnostic line.
 *
 * Upstreams routinely echo the credential they were sent ("Incorrect API key
 * provided: sk-..."). This text is persisted on the usage row and shown to the
 * customer, so it is redacted here, at the boundary that first sees it, before
 * any caller can store or return it.
 */
export async function readProviderError(response: Response) {
  const text = await response.text().catch(() => "");

  try {
    const payload = JSON.parse(text) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const nested =
      typeof payload.error === "object"
        ? payload.error?.message
        : payload.error;

    return redactSecrets(
      String(nested || payload.message || text || `HTTP ${response.status}`),
    ).slice(0, MAX_ERROR_LENGTH);
  } catch {
    return redactSecrets(text || `HTTP ${response.status}`).slice(
      0,
      MAX_ERROR_LENGTH,
    );
  }
}
