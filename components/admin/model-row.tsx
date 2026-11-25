"use client";

import type { AdminModelSummary, ModelGroupSummary } from "@/lib/types";

import { Button, Chip, Spinner } from "@heroui/react";

import { GroupSelect } from "@/components/admin/group-select";
import { ModelCostEditor } from "@/components/admin/model-cost-editor";
import { StatusChip } from "@/components/dashboard/chips";
import {
  formatMarginPercent,
  formatPricePer1M,
  formatSignedMicros,
} from "@/components/dashboard/format";
import { catalogEconomics, scenarioLabel } from "@/lib/catalog-economics";
import { publisherFromModelId } from "@/lib/model-identity";
import { priceToMicros } from "@/lib/pricing";

function price(model: AdminModelSummary) {
  if (model.access === "free") return "Free";

  if (model.inputPricePer1M === 0 && model.outputPricePer1M === 0) {
    return model.access === "subscription" ? "Subscription" : "Unpriced";
  }

  return `${formatPricePer1M(model.inputPricePer1M)} / ${formatPricePer1M(model.outputPricePer1M)}`;
}

/**
 * One catalog row. Extracted from the table when the selection column arrived
 * (FID-2026-1123-003): the table owns filters and selection, the row owns what a
 * single model shows and the one switch that changes it.
 */
export function ModelRow({
  model,
  groups,
  busy,
  selected,
  onSelect,
  onToggle,
}: {
  model: AdminModelSummary;
  groups: ModelGroupSummary[];
  busy: boolean;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onToggle: () => void;
}) {
  const economics = catalogEconomics({
    access: model.access,
    costInputMicros: priceToMicros(model.costInputPer1M),
    costOutputMicros: priceToMicros(model.costOutputPer1M),
    sellInputMicros: priceToMicros(model.inputPricePer1M),
    sellOutputMicros: priceToMicros(model.outputPricePer1M),
    costSource: model.costSource,
    costObservedAt: model.costObservedAt,
  });
  const active = model.status === "active";
  // A marketplace sells one model from many publishers under one account. The
  // winning route is identified by its upstream id, because every route's
  // provider slug is the same account (`inferhub`).
  const servingRoute =
    model.routes.find((route) => route.upstreamId === model.servedUpstreamId) ??
    null;
  const servingPublisher =
    servingRoute?.publisher ??
    publisherFromModelId(model.upstreamId, model.upstreamSlug);
  const offerPublishers = Array.from(
    new Set(model.routes.map((route) => route.publisher ?? route.providerSlug)),
  );
  const competing = model.routes.length > 1;

  return (
    <tr>
      <td>
        <input
          aria-label={`Select ${model.name}`}
          checked={selected}
          className="size-4 accent-current"
          type="checkbox"
          onChange={(event) => onSelect(event.target.checked)}
        />
      </td>
      <td className="max-w-[22rem]">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{model.name}</span>
          {!model.inCatalog ? (
            <Chip color="warning" size="sm" variant="soft">
              delisted
            </Chip>
          ) : null}
          {model.isPrimary && competing ? (
            <Chip color="success" size="sm" variant="soft">
              published
            </Chip>
          ) : null}
        </div>
        <div className="mono mt-0.5 truncate text-[11px] text-muted">
          {model.id}
        </div>
      </td>
      <td className="whitespace-nowrap text-muted">
        {model.servedProviderSlug ?? model.upstreamSlug}
        {servingPublisher ? (
          <p className="text-[11px] text-accent">
            {model.isPrimary ? "served by" : "offer from"} {servingPublisher}
          </p>
        ) : (
          <p className="text-[11px]">{model.protocol}</p>
        )}
        {competing ? (
          <p className="text-[11px]" title={offerPublishers.join(" · ")}>
            {model.routes.length} offers ·{" "}
            {offerPublishers.slice(0, 3).join(" · ")}
            {offerPublishers.length > 3
              ? ` +${offerPublishers.length - 3}`
              : ""}
          </p>
        ) : null}
      </td>
      <td className="text-muted">{model.family}</td>
      <td>
        <GroupSelect
          groupSlug={model.groupSlug}
          groups={groups}
          modelId={model.id}
        />
        <p className="mt-1 text-[11px] text-muted">
          {model.access} billing · {model.groupSource}
        </p>
      </td>
      <td>
        <StatusChip status={model.status} />
      </td>
      <td className="whitespace-nowrap text-right align-middle tabular-nums">
        {price(model)}
      </td>
      <td className="text-right align-middle">
        <ModelCostEditor model={model} />
      </td>
      <td className="whitespace-nowrap text-right align-middle tabular-nums">
        {model.access === "free" ? (
          <span className="text-success">Free group</span>
        ) : (
          <>
            <span>
              {formatMarginPercent(economics.inputMarginBps)} /{" "}
              {formatMarginPercent(economics.outputMarginBps)}
            </span>
            <p
              className={
                economics.blendedProfitMicros >= 0
                  ? "text-[11px] text-success"
                  : "text-[11px] text-danger"
              }
            >
              {formatSignedMicros(economics.blendedProfitMicros)}
            </p>
          </>
        )}
        {economics.warnings.length > 0 ? (
          <p
            className="max-w-[14rem] text-[11px] leading-4 text-warning"
            title={economics.warnings.join(" ")}
          >
            {economics.warnings[0]}
          </p>
        ) : null}
      </td>
      <td className="align-middle text-muted">{model.contextWindow}</td>
      <td>
        <Button
          isDisabled={busy || (!model.inCatalog && !active)}
          size="sm"
          variant={active ? "danger-soft" : "secondary"}
          onPress={onToggle}
        >
          {busy ? <Spinner size="sm" /> : null}
          {active ? "Disable" : "Enable"}
        </Button>
      </td>
    </tr>
  );
}

export const MODEL_ROW_SCENARIO = scenarioLabel({
  inputTokens: 1_000_000,
  outputTokens: 1_000_000,
});
