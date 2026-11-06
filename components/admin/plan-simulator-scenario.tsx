"use client";

import type {
  PlanSimulationScenario,
  SimulationModel,
  SimulationUsage,
  SimulationWorkload,
} from "@/lib/economics";

import { Input } from "@heroui/react";

import {
  formatCompact,
  formatMarginPercent,
  formatMicros,
  formatNumber,
} from "@/components/dashboard/format";

const selectClass =
  "h-10 w-full rounded-xl border border-black/10 bg-background px-3 text-sm text-foreground outline-none focus:border-accent dark:border-white/10";

function statusClass(status: PlanSimulationScenario["status"]) {
  if (status === "blocked") return "border-danger/30 bg-danger/10 text-danger";
  if (status === "overage_credit") {
    return "border-warning/30 bg-warning/10 text-warning";
  }

  return "border-success/30 bg-success/10 text-success";
}

export function ScenarioCard({
  scenario,
  workload,
  models,
  onAdd,
  onRemove,
  onUpdate,
}: {
  scenario: PlanSimulationScenario;
  workload: SimulationWorkload;
  models: SimulationModel[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<SimulationUsage>) => void;
}) {
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold capitalize">{scenario.label}</h3>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${statusClass(scenario.status)}`}
        >
          {scenario.status.replaceAll("_", " ")}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Value
          label="Weighted"
          value={formatCompact(scenario.weightedTokens)}
        />
        <Value
          label="Overage"
          value={formatCompact(scenario.overageWeightedTokens)}
        />
        <Value label="Revenue" value={formatMicros(scenario.revenueMicros)} />
        <Value label="Cost" value={formatMicros(scenario.costMicros)} />
        <Value
          label="Contribution"
          value={
            scenario.contributionMicros === null
              ? "—"
              : formatMicros(scenario.contributionMicros)
          }
        />
        <Value label="Margin" value={formatMarginPercent(scenario.marginBps)} />
      </div>

      <div className="mt-3 space-y-2">
        {workload.usage.map((row, index) => (
          <div
            key={`${row.modelId}-${index}`}
            className="rounded-lg border border-black/10 p-2 dark:border-white/10"
          >
            <div className="flex gap-1">
              <select
                aria-label={`${scenario.label} model ${index + 1}`}
                className={selectClass}
                value={row.modelId}
                onChange={(event) =>
                  onUpdate(index, { modelId: event.target.value })
                }
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              <button
                aria-label={`Remove ${scenario.label} model ${index + 1}`}
                className="shrink-0 rounded-lg border border-black/10 px-2 text-xs text-muted hover:text-danger dark:border-white/10"
                type="button"
                onClick={() => onRemove(index)}
              >
                <i aria-hidden className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="space-y-1 text-[10px] text-muted">
                <span className="block">Input tokens</span>
                <Input
                  aria-label={`${scenario.label} input tokens ${index + 1}`}
                  inputMode="numeric"
                  value={String(row.inputTokens)}
                  onChange={(event) =>
                    onUpdate(index, {
                      inputTokens: Number(event.target.value || 0),
                    })
                  }
                />
              </div>
              <div className="space-y-1 text-[10px] text-muted">
                <span className="block">Output tokens</span>
                <Input
                  aria-label={`${scenario.label} output tokens ${index + 1}`}
                  inputMode="numeric"
                  value={String(row.outputTokens)}
                  onChange={(event) =>
                    onUpdate(index, {
                      outputTokens: Number(event.target.value || 0),
                    })
                  }
                />
              </div>
            </div>
          </div>
        ))}
        <button
          className="w-full rounded-lg border border-dashed border-black/15 py-1.5 text-[11px] text-muted hover:text-foreground dark:border-white/15"
          type="button"
          onClick={onAdd}
        >
          + Add model
        </button>
      </div>

      {scenario.rows.length > 0 ? (
        <div className="mt-3 space-y-1 border-t border-black/10 pt-2 text-[10px] text-muted dark:border-white/10">
          {scenario.rows.map((row) => (
            <div key={row.modelId} className="flex justify-between gap-2">
              <span className="truncate">{row.modelName}</span>
              <span className="shrink-0">
                {formatNumber(row.weightedTokens)} wt ·{" "}
                {row.costMicros === null
                  ? "unknown cost"
                  : formatMicros(row.costMicros)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {scenario.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1 text-[10px] leading-4 text-warning">
          {scenario.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {scenario.unknownModelIds.length > 0 ? (
        <p className="mt-2 text-[10px] text-danger">
          Unknown model ids: {scenario.unknownModelIds.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.1em] text-muted">
        {label}
      </p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
