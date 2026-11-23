"use client";

import type { RouterCheapEvidence } from "@/lib/providers/review-evidence";

import { microsToPrice } from "@/lib/pricing";

export function dollars(micros: number) {
  return `$${microsToPrice(micros).toFixed(3)}`;
}

export function usd(value: number | null) {
  if (value === null) return "—";

  return `$${value.toFixed(value > 0 && value < 1 ? 4 : 3)}`;
}

/**
 * The two read-only feeds shown beside the review decision.
 *
 * They are context for the operator's judgement and never a billing input: no
 * reseller or public price is imported into a model cost.
 */
export function EvidenceSummary({
  evidence,
}: {
  evidence: RouterCheapEvidence;
}) {
  const plan = [
    evidence.reseller.planId === null
      ? null
      : `plan ${evidence.reseller.planId}`,
    evidence.reseller.planVersion === null
      ? null
      : `v${evidence.reseller.planVersion}`,
    evidence.reseller.unit,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mb-3 grid gap-2 rounded-xl border border-default-200 p-3 text-[11px] text-muted sm:grid-cols-2">
      <div>
        <p className="font-medium text-foreground">Reseller plan (read-only)</p>
        {evidence.reseller.state === "ok" ? (
          <p>
            {Object.keys(evidence.reseller.rows).length} rows
            {plan ? ` · ${plan}` : ""}
            {" · observed "}
            <span className="mono">{evidence.reseller.observedAt}</span>
          </p>
        ) : (
          <p>{evidence.reseller.detail ?? "Unavailable."}</p>
        )}
      </div>
      <div>
        <p className="font-medium text-foreground">
          Public pricing (read-only)
        </p>
        {evidence.public.state === "ok" ? (
          <p>
            {Object.keys(evidence.public.rows).length} rows
            {evidence.public.pricingVersion
              ? ` · ${evidence.public.pricingVersion}`
              : ""}
            {" · observed "}
            <span className="mono">{evidence.public.observedAt}</span>
          </p>
        ) : (
          <p>{evidence.public.detail ?? "Unavailable."}</p>
        )}
      </div>
      <p className="sm:col-span-2">
        Reference only. These feeds never set a cost or sell price; the manual
        cost below remains the only billing basis.
      </p>
    </div>
  );
}
