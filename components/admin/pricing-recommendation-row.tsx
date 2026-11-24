"use client";

import type { PricingModelRow } from "@/lib/pricing-view";
import type { PriceRecommendation } from "@/lib/price-recommendation";
import type { HistoricalVolume } from "@/lib/pricing-command";

import { Button, Spinner } from "@heroui/react";

import {
  formatMarginPercent,
  formatPricePer1M,
  formatSignedMicros,
} from "@/components/dashboard/format";
import { PricingVolumeCell } from "@/components/admin/pricing-volume-cell";
import { microsToPrice, priceToMicros } from "@/lib/pricing";
import { projectPricingVolume } from "@/lib/pricing-command";

/**
 * One recommendation row. Extracted from the card when the table gained a page
 * (FID-2026-1124-001): the card owns the target margin, the reason and the
 * approval request; the row owns what a single model would earn.
 */
export function PricingRecommendationRow({
  model,
  recommendation,
  volume,
  windowDays,
  savingId,
  canApprove,
  onApprove,
}: {
  model: PricingModelRow;
  recommendation: PriceRecommendation;
  volume: HistoricalVolume | undefined;
  windowDays: number;
  savingId: string | null;
  canApprove: boolean;
  onApprove: (model: PricingModelRow) => void;
}) {
  const eligible = recommendation.eligible;
  const warning = recommendation.warnings.join(" ");
  const projected = eligible
    ? projectPricingVolume(
        volume,
        {
          inputMicros: recommendation.inputMicros,
          outputMicros: recommendation.outputMicros,
        },
        {
          inputMicros: priceToMicros(model.costInputPer1M),
          outputMicros: priceToMicros(model.costOutputPer1M),
        },
        model.costSource !== "unknown",
      )
    : null;

  return (
    <tr>
      <td className="max-w-[18rem] align-middle">
        <p className="truncate font-medium">{model.name}</p>
        <p className="mono mt-0.5 truncate text-[11px] text-muted">
          {model.id}
        </p>
      </td>
      <td className="whitespace-nowrap align-middle text-muted">
        {model.costSource}
        {model.servedProviderSlug ? (
          <p className="text-[11px]">via {model.servedProviderSlug}</p>
        ) : null}
      </td>
      <td className="whitespace-nowrap text-right align-middle tabular-nums">
        {formatPricePer1M(model.inputPricePer1M)} /{" "}
        {formatPricePer1M(model.outputPricePer1M)}
      </td>
      <td className="whitespace-nowrap text-right align-middle tabular-nums">
        {eligible ? (
          <>
            {formatPricePer1M(microsToPrice(recommendation.inputMicros))} /{" "}
            {formatPricePer1M(microsToPrice(recommendation.outputMicros))}
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="whitespace-nowrap text-right align-middle">
        {eligible ? (
          <>
            {formatMarginPercent(recommendation.inputMarginBps)} /{" "}
            {formatMarginPercent(recommendation.outputMarginBps)}
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
      <PricingVolumeCell
        hadVolume={Boolean(volume)}
        projected={projected}
        requests={volume?.requests ?? 0}
      />
      <td className="align-middle">
        {eligible ? (
          <div className="space-y-1">
            <Button
              isDisabled={savingId !== null || !canApprove}
              size="sm"
              variant="secondary"
              onPress={() => onApprove(model)}
            >
              {savingId === model.id ? <Spinner size="sm" /> : null}
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
        <span className="sr-only">{windowDays}d volume</span>
      </td>
    </tr>
  );
}
