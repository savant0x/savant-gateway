/**
 * Read-only reference evidence for providers that require model review.
 *
 * The account catalog proves identifiers only. The reseller plan and the public
 * pricing feed are separate vendor claims with different units and scopes.
 * They are shown to the operator for comparison; neither is imported as a cost.
 * Every parser is total: a malformed payload becomes `unavailable`, never a
 * fabricated row or a zero price.
 */

export type ReviewFeedState = "ok" | "unavailable";

export type ResellerEvidenceRow = {
  available: boolean | null;
  billing: string | null;
  source: string | null;
  group: string | null;
  costInputUsd: number | null;
  costOutputUsd: number | null;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  perRequestUsd: number | null;
};

export type PublicEvidenceRow = {
  billingExpr: string | null;
  billingMode: string | null;
  endpointTypes: string[];
  contextLength: number | null;
};

export type ResellerEvidence = {
  state: ReviewFeedState;
  detail: string | null;
  observedAt: string;
  planId: number | null;
  planVersion: number | null;
  unit: string | null;
  rows: Record<string, ResellerEvidenceRow>;
};

export type PublicEvidence = {
  state: ReviewFeedState;
  detail: string | null;
  observedAt: string;
  pricingVersion: string | null;
  rows: Record<string, PublicEvidenceRow>;
};

export type RouterCheapEvidence = {
  reseller: ResellerEvidence;
  public: PublicEvidence;
};

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asText(value: unknown, maxLength = 200): string | null {
  if (typeof value !== "string") return null;

  const text = value.trim();

  return text ? text.slice(0, maxLength) : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string" || !value.trim()) return null;

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === 0) return value === 1;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;

  return null;
}

function asStringList(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((item) => item.slice(0, 40));
}

function firstRows(
  payload: unknown,
): { root: JsonObject; rows: unknown[] } | null {
  if (Array.isArray(payload)) return { root: {}, rows: payload };

  const root = asObject(payload);

  if (!root) return null;

  for (const key of ["data", "rows", "items", "models", "prices"]) {
    if (Array.isArray(root[key])) return { root, rows: root[key] };
  }

  return null;
}

export function resellerUnavailable(
  detail: string,
  observedAt: string,
): ResellerEvidence {
  return {
    state: "unavailable",
    detail: detail.slice(0, 240),
    observedAt,
    planId: null,
    planVersion: null,
    unit: null,
    rows: {},
  };
}

export function publicUnavailable(
  detail: string,
  observedAt: string,
): PublicEvidence {
  return {
    state: "unavailable",
    detail: detail.slice(0, 240),
    observedAt,
    pricingVersion: null,
    rows: {},
  };
}

export function parseResellerEvidence(
  payload: unknown,
  observedAt: string,
): ResellerEvidence {
  const parsed = firstRows(payload);

  if (!parsed) {
    return resellerUnavailable(
      "The reseller feed did not return a rows array.",
      observedAt,
    );
  }

  const rows: Record<string, ResellerEvidenceRow> = {};

  for (const item of parsed.rows) {
    const row = asObject(item);
    const id = asText(row?.model);

    if (!row || !id) continue;

    rows[id] = {
      available: asBoolean(row.available),
      billing: asText(row.billing, 40),
      source: asText(row.source, 80),
      group: asText(row.group, 80),
      costInputUsd: asNumber(row.cost_input_per_million_usd),
      costOutputUsd: asNumber(row.cost_output_per_million_usd),
      inputPerMillion: asNumber(row.input_per_million),
      outputPerMillion: asNumber(row.output_per_million),
      perRequestUsd:
        asNumber(row.cost_per_request_usd) ?? asNumber(row.per_request),
    };
  }

  return {
    state: "ok",
    detail: null,
    observedAt,
    planId: asNumber(parsed.root.plan_id),
    planVersion: asNumber(parsed.root.plan_version),
    unit: asText(parsed.root.unit_name, 20),
    rows,
  };
}

export function parsePublicEvidence(
  payload: unknown,
  observedAt: string,
): PublicEvidence {
  const parsed = firstRows(payload);

  if (!parsed) {
    return publicUnavailable(
      "The public pricing feed did not return a rows array.",
      observedAt,
    );
  }

  const rows: Record<string, PublicEvidenceRow> = {};

  for (const item of parsed.rows) {
    const row = asObject(item);
    const id = asText(row?.model_name) ?? asText(row?.model) ?? asText(row?.id);

    if (!row || !id) continue;

    rows[id] = {
      billingExpr: asText(row.billing_expr, 500),
      billingMode: asText(row.billing_mode, 80),
      endpointTypes: asStringList(row.supported_endpoint_types),
      contextLength: asNumber(row.context_length),
    };
  }

  return {
    state: "ok",
    detail: null,
    observedAt,
    pricingVersion: asText(parsed.root.pricing_version, 120),
    rows,
  };
}
