"use client";

import type {
  EligibilityDecision,
  ProviderReviewModel,
} from "@/lib/providers/eligibility";
import type { RouterCheapEvidence } from "@/lib/providers/review-evidence";

import { Button, Card, Chip, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { responseError } from "@/components/dashboard/format";
import { microsToPrice } from "@/lib/pricing";

const DECISIONS: Array<{ value: EligibilityDecision; label: string }> = [
  { value: "chat", label: "Chat" },
  { value: "unsupported", label: "Unsupported" },
  { value: "unknown", label: "Unknown" },
];

function dollars(micros: number) {
  return `$${microsToPrice(micros).toFixed(3)}`;
}

function usd(value: number | null) {
  if (value === null) return "—";

  return `$${value.toFixed(value > 0 && value < 1 ? 4 : 3)}`;
}

function EvidenceSummary({ evidence }: { evidence: RouterCheapEvidence }) {
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

export function ProviderEligibility({
  slug,
  label,
  onClose,
}: {
  slug: string;
  label: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [models, setModels] = useState<ProviderReviewModel[] | null>(null);
  const [evidence, setEvidence] = useState<RouterCheapEvidence | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await fetch(
          `/api/admin/providers/${slug}/eligibility`,
        );

        if (!response.ok) throw new Error(await responseError(response));

        const data = (await response.json()) as {
          models?: ProviderReviewModel[];
          evidence?: RouterCheapEvidence | null;
        };

        if (active) {
          setModels(data.models ?? []);
          setEvidence(data.evidence ?? null);
        }
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : "The review failed.",
          );
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [slug]);

  async function decide(
    model: ProviderReviewModel,
    decision: EligibilityDecision,
  ) {
    setBusy(`${model.id}:${decision}`);
    setError(null);

    try {
      const response = await fetch(`/api/admin/providers/${slug}/eligibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upstreamId: model.upstreamId,
          decision,
          source: "operator",
        }),
      });

      if (!response.ok) throw new Error(await responseError(response));

      const data = (await response.json()) as {
        models?: ProviderReviewModel[];
      };

      setModels(data.models ?? []);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The decision failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>{label} review</Card.Title>
            <Card.Description>
              Only a dated chat decision is eligible. Costs and sell prices must
              also be positive before a paid row can publish or serve. The
              decision survives a refetch and a delisting.
            </Card.Description>
          </div>
          <Button size="sm" variant="secondary" onPress={onClose}>
            Close
          </Button>
        </div>
      </Card.Header>
      <Card.Content>
        {error ? (
          <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        ) : null}
        {evidence ? <EvidenceSummary evidence={evidence} /> : null}
        {models === null ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner size="sm" /> Loading the provider catalog…
          </p>
        ) : models.length === 0 ? (
          <p className="text-sm text-muted">
            No catalog rows yet. Configure the key and sync this provider, then
            return here to record decisions.
          </p>
        ) : (
          <div className="scroll-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account catalog</th>
                  <th>Decision</th>
                  <th>Manual cost in / out</th>
                  <th>Sell in / out</th>
                  <th>Decision evidence</th>
                  <th>Reseller plan</th>
                  <th>Public pricing</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => {
                  const reseller =
                    evidence?.reseller.state === "ok"
                      ? evidence.reseller.rows[model.upstreamId]
                      : null;
                  const publicRow =
                    evidence?.public.state === "ok"
                      ? evidence.public.rows[model.upstreamId]
                      : null;

                  return (
                    <tr key={model.id}>
                      <td className="max-w-[22rem]">
                        <p className="font-medium">{model.name}</p>
                        <p className="mono truncate text-[11px] text-muted">
                          {model.upstreamId}
                        </p>
                        <p className="mt-1 text-[11px] text-muted">
                          {model.status} ·{" "}
                          {model.inCatalog ? "listed" : "delisted"}{" "}
                          {model.costSource === "manual"
                            ? ` · manual cost ${model.costObservedAt ?? "undated"}`
                            : ` · ${model.costSource} cost`}
                        </p>
                      </td>
                      <td>
                        <Chip
                          color={
                            model.decision === "chat" ? "success" : "default"
                          }
                          size="sm"
                          variant="soft"
                        >
                          {model.decision ?? "unknown"}
                        </Chip>
                      </td>
                      <td className="whitespace-nowrap text-xs">
                        {dollars(model.costInputMicros)} /{" "}
                        {dollars(model.costOutputMicros)}
                      </td>
                      <td className="whitespace-nowrap text-xs">
                        {dollars(model.sellInputMicros)} /{" "}
                        {dollars(model.sellOutputMicros)}
                      </td>
                      <td className="max-w-[16rem] text-[11px] text-muted">
                        {model.source ?? "no evidence"}
                        {model.observedAt ? ` · ${model.observedAt}` : ""}
                        {model.note ? ` · ${model.note}` : ""}
                      </td>
                      <td className="max-w-[13rem] text-[11px]">
                        {reseller ? (
                          <>
                            <p
                              className={
                                reseller.available === false
                                  ? "text-warning"
                                  : undefined
                              }
                            >
                              {reseller.available === null
                                ? "unknown"
                                : reseller.available
                                  ? "available"
                                  : "unavailable"}
                            </p>
                            <p className="mono text-muted">
                              {usd(reseller.costInputUsd)} /{" "}
                              {usd(reseller.costOutputUsd)} per 1M
                            </p>
                            {reseller.source ? (
                              <p className="truncate text-muted">
                                {reseller.source}
                              </p>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted">
                            {evidence?.reseller.state === "unavailable"
                              ? "feed unavailable"
                              : "not listed"}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[15rem] text-[11px]">
                        {publicRow ? (
                          <>
                            <p>
                              {publicRow.endpointTypes.length > 0
                                ? publicRow.endpointTypes.join(", ")
                                : "no endpoints"}
                            </p>
                            <p
                              className="mono truncate text-muted"
                              title={publicRow.billingExpr ?? undefined}
                            >
                              {publicRow.billingExpr ?? "no expression"}
                            </p>
                          </>
                        ) : (
                          <span className="text-muted">
                            {evidence?.public.state === "unavailable"
                              ? "feed unavailable"
                              : "not listed"}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          {DECISIONS.map((option) => (
                            <Button
                              key={option.value}
                              isDisabled={busy !== null}
                              size="sm"
                              variant={
                                model.decision === option.value
                                  ? "primary"
                                  : "secondary"
                              }
                              onPress={() => decide(model, option.value)}
                            >
                              {busy === `${model.id}:${option.value}` ? (
                                <Spinner size="sm" />
                              ) : null}
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
