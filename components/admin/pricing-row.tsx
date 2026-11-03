import type { AdminModelSummary, ModelGroupSummary } from "@/lib/types";
import type { PriceDraft } from "./pricing-draft";

import { Button, Chip, Spinner } from "@heroui/react";

import { parseDraftPrice } from "./pricing-draft";

import { GroupSelect } from "@/components/admin/group-select";
import { PricingInputs } from "@/components/admin/pricing-inputs";
import {
  formatMarginPercent,
  formatPricePer1M,
  formatSignedMicros,
} from "@/components/dashboard/format";
import { blendedProfitMicros, marginBps, priceToMicros } from "@/lib/pricing";

function marginTone(value: number | null) {
  if (value === null) return "default" as const;

  return value >= 0 ? ("success" as const) : ("danger" as const);
}

export function PricingRow({
  model,
  groups,
  draft,
  dirty,
  saving,
  onChange,
  onSave,
}: {
  model: AdminModelSummary;
  groups: ModelGroupSummary[];
  draft: PriceDraft;
  dirty: boolean;
  saving: boolean;
  onChange: (patch: Partial<PriceDraft>) => void;
  onSave: () => void;
}) {
  const free = model.access === "free";
  const costIn = priceToMicros(model.costInputPer1M);
  const costOut = priceToMicros(model.costOutputPer1M);
  const draftIn = parseDraftPrice(draft.input);
  const draftOut = parseDraftPrice(draft.output);
  const sellIn = draftIn === null ? null : priceToMicros(draftIn);
  const sellOut = draftOut === null ? null : priceToMicros(draftOut);
  const inputMargin =
    sellIn === null ? model.inputMarginBps : marginBps(costIn, sellIn);
  const outputMargin =
    sellOut === null ? model.outputMarginBps : marginBps(costOut, sellOut);
  const profit =
    sellIn === null || sellOut === null
      ? model.blendedProfitMicros
      : blendedProfitMicros({
          costInputMicros: costIn,
          costOutputMicros: costOut,
          sellInputMicros: sellIn,
          sellOutputMicros: sellOut,
        });

  return (
    <tr>
      <td className="max-w-[18rem]">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{model.name}</span>
          <Chip
            color={model.priceSource === "manual" ? "accent" : "default"}
            size="sm"
            variant="soft"
          >
            {model.priceSource}
          </Chip>
        </div>
        <div className="mono mt-0.5 truncate text-[11px] text-muted">
          {model.id}
        </div>
      </td>
      <td className="text-muted">{model.family}</td>
      <td>
        <GroupSelect
          groupSlug={model.groupSlug}
          groups={groups}
          modelId={model.id}
        />
        <p className="mt-1 text-[11px] text-muted">{model.access} billing</p>
      </td>
      <td className="whitespace-nowrap text-right align-middle text-muted tabular-nums">
        {free
          ? "Free"
          : `${formatPricePer1M(model.costInputPer1M)} / ${formatPricePer1M(model.costOutputPer1M)}`}
      </td>
      <td className="text-right">
        {free ? (
          <div>
            <span className="text-success">Free</span>
            <p className="text-[11px] text-muted">move group to charge</p>
            {costIn > 0 || costOut > 0 ? (
              <p className="text-[11px] text-warning">
                upstream cost still billed
              </p>
            ) : null}
          </div>
        ) : (
          <div className="ml-auto w-[15rem]">
            <PricingInputs
              compact
              help="Customer sell price. Saving marks the row manual, so a later provider sync will not overwrite it."
              idPrefix={`sell-${model.id}`}
              input={draft.input}
              inputInvalid={draftIn === null}
              legend="Sell price"
              output={draft.output}
              outputInvalid={draftOut === null}
              onInput={(value) => onChange({ input: value })}
              onOutput={(value) => onChange({ output: value })}
            />
          </div>
        )}
      </td>
      <td className="whitespace-nowrap text-right align-middle">
        {free ? (
          "—"
        ) : (
          <div className="flex flex-col items-end gap-1">
            <Chip color={marginTone(inputMargin)} size="sm" variant="soft">
              in {formatMarginPercent(inputMargin)}
            </Chip>
            <Chip color={marginTone(outputMargin)} size="sm" variant="soft">
              out {formatMarginPercent(outputMargin)}
            </Chip>
          </div>
        )}
      </td>
      <td className="whitespace-nowrap text-right align-middle tabular-nums">
        <span className={profit >= 0 ? "text-success" : "text-danger"}>
          {formatSignedMicros(profit)}
        </span>
      </td>
      <td>
        <Button
          isDisabled={
            free || !dirty || saving || draftIn === null || draftOut === null
          }
          size="sm"
          variant="secondary"
          onPress={onSave}
        >
          {saving ? <Spinner size="sm" /> : null}
          Save
        </Button>
      </td>
    </tr>
  );
}
