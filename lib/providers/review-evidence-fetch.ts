import "server-only";

import {
  fetchPublicResponse,
  readBoundedResponseText,
} from "../content/transport.ts";

import {
  parsePublicEvidence,
  parseResellerEvidence,
  publicUnavailable,
  resellerUnavailable,
  type RouterCheapEvidence,
} from "./review-evidence.ts";

const RESELLER_URL = "https://router.cheap/api/reseller/v1/prices";
const PUBLIC_URL = "https://router.cheap/api/pricing";
const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 5_000;

function failureDetail(label: string, error: unknown): string {
  if (error instanceof SyntaxError) return `${label} returned invalid JSON.`;

  if (error instanceof Error && error.name === "TimeoutError") {
    return `${label} timed out.`;
  }

  if (error instanceof Error && /^HTTP \d{3}$/.test(error.message)) {
    return `${label} returned ${error.message}.`;
  }

  return `${label} is unavailable.`;
}

async function readJson(
  url: string,
  headers: Record<string, string>,
  label: string,
) {
  const { response } = await fetchPublicResponse(url, {
    cache: "no-store",
    headers,
    timeoutMs: TIMEOUT_MS,
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const text = await readBoundedResponseText(response, MAX_BYTES, label);

  return JSON.parse(text) as unknown;
}

/**
 * Reads the two public reference feeds. The reseller token is sent only to the
 * reseller endpoint; it never appears in the normalized result or the browser.
 * A feed failure is data for the operator, not an exception that hides the
 * durable catalog and decisions.
 */
export async function readRouterCheapEvidence(
  observedAt = new Date().toISOString(),
): Promise<RouterCheapEvidence> {
  const token = process.env.ROUTER_CHEAP_RESELLER_API_KEY?.trim();

  const reseller = token
    ? readJson(
        RESELLER_URL,
        {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        "The router.cheap reseller feed",
      )
        .then((payload) => parseResellerEvidence(payload, observedAt))
        .catch((error) =>
          resellerUnavailable(
            failureDetail("The router.cheap reseller feed", error),
            observedAt,
          ),
        )
    : Promise.resolve(
        resellerUnavailable(
          "ROUTER_CHEAP_RESELLER_API_KEY is not configured.",
          observedAt,
        ),
      );

  const publicPricing = readJson(
    PUBLIC_URL,
    { Accept: "application/json" },
    "The router.cheap public pricing feed",
  )
    .then((payload) => parsePublicEvidence(payload, observedAt))
    .catch((error) =>
      publicUnavailable(
        failureDetail("The router.cheap public pricing feed", error),
        observedAt,
      ),
    );

  const [resellerEvidence, publicEvidence] = await Promise.all([
    reseller,
    publicPricing,
  ]);

  return { reseller: resellerEvidence, public: publicEvidence };
}
