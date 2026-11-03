"use client";

import type { AdminModelSummary } from "@/lib/types";
import type {
  PriceRecommendation,
  RoundingPolicy,
} from "@/lib/price-recommendation";

import { Button, Card, Chip, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  formatMarginPercent,
  formatPricePer1M,
  formatSignedMicros,
  responseError,
} from "@/components/dashboard/format";
import { StatePanel } from "@/components/ui/state-panel";
import { adminLoginHref } from "@/lib/admin-return";
import { microsToPrice, priceToMicros } from "@/lib/pricing";
import { recommendPrices } from "@/lib/price-recommendation";

function recommendationFor(
  model: AdminModelSummary,
  targetMarginBps: number,
  rounding: RoundingPolicy,
): PriceRecommendation {
  return recommendPrices({
    access: model.access,
    costInputMicros: priceToMicros(model.costInputPer1M),
    costOutputMicros: priceToMicros(model.costOutputPer1M),
    currentInputMicros: priceToMicros(model.inputPricePer1M),
    currentOutputMicros: priceToMicros(model.outputPricePer1M),
    costSource: model.costSource,
    costObservedAt: model.costObservedAt,
    targetMarginBps,
    rounding,
  });
}

export function PricingRecommendations({
  models,
  defaultTargetPercent = 30,
}: {
  models: AdminModelSummary[];
  defaultTargetPercent?: number;
}) {
  const router = useRouter();
  const [target, setTarget] = useState(String(defaultTargetPercent));
  const [rounding, setRounding] = useState<RoundingPolicy>("micro");
  const [reason, setReason] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const targetBps = Math.round(Number(target) * 100);
  const targetValid =
    Number.isFinite(targetBps) && targetBps >= 0 && targetBps <= 9_900;
  const reasonValid = reason.trim().length >= 3;
  const rows = useMemo(
    () =>
      models
        .filter((model) => model.inCatalog && model.access === "paid")
        .map((model) => ({
          model,
          recommendation: recommendationFor(
            model,
            Number.isFinite(targetBps) ? targetBps : 0,
            rounding,
          ),
        })),
    [models, rounding, targetBps],
  );

  async function approve(model: AdminModelSummary) {
    setSavingId(model.id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: model.id,
          mode: "recommendation",
          targetMarginBps: targetBps,
          rounding,
          reason: reason.trim(),
        }),
      });

      if (response.status === 401) {
        router.replace(
          adminLoginHref(
            `${window.location.pathname}${window.location.search}`,
          ),
        );

        return;
      }

      if (!response.ok) throw new Error(await responseError(response));

      setNotice(
        `${model.name} approved at the recommended price. The cost basis and reason are recorded in the pricing history.`,
      );
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not approve the recommendation.",
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>Guarded price recommendations</Card.Title>
            <Card.Description>
              A recommendation is a draft calculated from the serving
              route&apos;s upstream cost and your target margin. It never
              publishes by itself: approval needs a reason and records the cost
              basis, before/after prices and margin in the pricing history.
            </Card.Description>
          </div>
          <Chip color="default" size="sm" variant="soft">
            {rows.length} paid rows
          </Chip>
        </div>
      </Card.Header>
      <Card.Content className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[10rem_10rem_1fr]">
          <div>
            <label
              className="block text-[11px] font-medium text-muted"
              htmlFor="recommendation-target"
            >
              Target margin %
            </label>
            <input
              aria-invalid={!targetValid || undefined}
              className="mt-1 h-10 w-full rounded-xl border border-black/10 bg-background px-3 text-sm tabular-nums outline-none focus:border-accent dark:border-white/10"
              id="recommendation-target"
              inputMode="decimal"
              max={99}
              min={0}
              step="0.1"
              type="number"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
          </div>
          <div>
            <label
              className="block text-[11px] font-medium text-muted"
              htmlFor="recommendation-rounding"
            >
              Rounding
            </label>
            <select
              className="mt-1 h-10 w-full rounded-xl border border-black/10 bg-background px-3 text-xs outline-none focus:border-accent dark:border-white/10"
              id="recommendation-rounding"
              value={rounding}
              onChange={(event) =>
                setRounding(event.target.value === "cent" ? "cent" : "micro")
              }
            >
              <option value="micro">Nearest micro ($0.000001)</option>
              <option value="cent">Nearest cent ($0.01)</option>
            </select>
          </div>
          <div>
            <label
              className="block text-[11px] font-medium text-muted"
              htmlFor="recommendation-reason"
            >
              Approval reason (required)
            </label>
            <input
              aria-invalid={!reasonValid || undefined}
              className="mt-1 h-10 w-full rounded-xl border border-black/10 bg-background px-3 text-sm outline-none focus:border-accent dark:border-white/10"
              id="recommendation-reason"
              maxLength={500}
              placeholder="e.g. Quarterly margin review"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>

        {!targetValid ? (
          <p className="text-xs text-danger">
            Enter a target margin between 0% and 99%.
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
            {notice}
          </p>
        ) : null}

        {rows.length === 0 ? (
          <StatePanel
            description="No paid model is in the catalog yet. Sync a provider and assign a paid group before approving prices."
            state="empty"
            title="No paid rows to recommend."
          />
        ) : (
          <div className="scroll-shell max-h-[40rem]">
            <table className="data-table">
              <caption className="sr-only">
                Price recommendations for paid catalog models
              </caption>
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Cost basis</th>
                  <th className="text-right" scope="col">
                    Current sell / 1M
                  </th>
                  <th className="text-right" scope="col">
                    Recommended / 1M
                  </th>
                  <th className="text-right" scope="col">
                    Margin
                  </th>
                  <th className="text-right" scope="col">
                    Profit
                  </th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ model, recommendation }) => {
                  const eligible = recommendation.eligible;
                  const warning = recommendation.warnings.join(" ");

                  return (
                    <tr key={model.id}>
                      <td className="max-w-[18rem] align-middle">
                        <p className="truncate font-medium">{model.name}</p>
                        <p className="mono mt-0.5 truncate text-[11px] text-muted">
                          {model.id}
                        </p>
                      </td>
                      <td className="whitespace-nowrap align-middle text-muted">
                        {model.costSource}
                        {model.servedProviderSlug ? (
                          <p className="text-[11px]">
                            via {model.servedProviderSlug}
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap text-right align-middle tabular-nums">
                        {formatPricePer1M(model.inputPricePer1M)} /{" "}
                        {formatPricePer1M(model.outputPricePer1M)}
                      </td>
                      <td className="whitespace-nowrap text-right align-middle tabular-nums">
                        {eligible ? (
                          <>
                            {formatPricePer1M(
                              microsToPrice(recommendation.inputMicros),
                            )}{" "}
                            /{" "}
                            {formatPricePer1M(
                              microsToPrice(recommendation.outputMicros),
                            )}
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right align-middle">
                        {eligible ? (
                          <>
                            {formatMarginPercent(recommendation.inputMarginBps)}{" "}
                            /{" "}
                            {formatMarginPercent(
                              recommendation.outputMarginBps,
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right align-middle tabular-nums">
                        {eligible ? (
                          <span title={warning || undefined}>
                            {formatSignedMicros(
                              recommendation.inputMicros +
                                recommendation.outputMicros -
                                priceToMicros(model.costInputPer1M) -
                                priceToMicros(model.costOutputPer1M),
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="align-middle">
                        {eligible ? (
                          <div className="space-y-1">
                            <Button
                              isDisabled={
                                savingId !== null ||
                                !reasonValid ||
                                !targetValid
                              }
                              size="sm"
                              variant="secondary"
                              onPress={() => approve(model)}
                            >
                              {savingId === model.id ? (
                                <Spinner size="sm" />
                              ) : null}
                              Approve
                            </Button>
                            {warning ? (
                              <p className="max-w-[16rem] text-[11px] leading-4 text-warning">
                                {warning}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="max-w-[16rem] text-[11px] leading-4 text-muted">
                            {recommendation.reason}
                          </p>
                        )}
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
