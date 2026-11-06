"use client";

import type {
  SimulationModel,
  SimulationUsage,
  SimulationWorkload,
} from "@/lib/economics";
import type { PlanInterval, PlanOverageMode } from "@/lib/types";

import { Input } from "@heroui/react";
import { useMemo, useState } from "react";

import { ScenarioCard } from "@/components/admin/plan-simulator-scenario";
import { simulatePlan } from "@/lib/plan-simulation";

const selectClass =
  "h-10 w-full rounded-xl border border-black/10 bg-background px-3 text-sm text-foreground outline-none focus:border-accent dark:border-white/10";

const INPUT_COUNTS: Record<
  SimulationWorkload["label"],
  { input: number; output: number }
> = {
  light: { input: 10_000, output: 2_000 },
  normal: { input: 200_000, output: 40_000 },
  heavy: { input: 1_000_000, output: 250_000 },
};

function initialWorkloads(models: SimulationModel[]): SimulationWorkload[] {
  return (["light", "normal", "heavy"] as const).map((label) => ({
    label,
    usage: models.slice(0, 2).map((model) => ({
      modelId: model.id,
      inputTokens: INPUT_COUNTS[label].input,
      outputTokens: INPUT_COUNTS[label].output,
    })),
  }));
}

export function PlanSimulator({ models }: { models: SimulationModel[] }) {
  const [priceUsd, setPriceUsd] = useState("29");
  const [interval, setInterval] = useState<PlanInterval>("month");
  const [allowance, setAllowance] = useState("1000000");
  const [overageMode, setOverageMode] = useState<PlanOverageMode>("block");
  const [markupBps, setMarkupBps] = useState("2500");
  const [workloads, setWorkloads] = useState<SimulationWorkload[]>(() =>
    initialWorkloads(models),
  );

  const simulation = useMemo(
    () =>
      simulatePlan({
        terms: {
          priceMicros: Math.round(Number(priceUsd || 0) * 1_000_000),
          interval,
          includedWeightedTokens: Number(allowance || 0),
          overageMode,
          overageMarkupBps: Number(markupBps || 0),
        },
        models,
        workloads,
      }),
    [priceUsd, interval, allowance, overageMode, markupBps, models, workloads],
  );

  function updateUsage(
    label: SimulationWorkload["label"],
    index: number,
    patch: Partial<SimulationUsage>,
  ) {
    setWorkloads((current) =>
      current.map((scenario) =>
        scenario.label !== label
          ? scenario
          : {
              ...scenario,
              usage: scenario.usage.map((row, rowIndex) =>
                rowIndex === index ? { ...row, ...patch } : row,
              ),
            },
      ),
    );
  }

  function addUsage(label: SimulationWorkload["label"]) {
    if (models.length === 0) return;

    setWorkloads((current) =>
      current.map((scenario) => {
        if (scenario.label !== label) return scenario;

        const used = new Set(scenario.usage.map((row) => row.modelId));
        const next = models.find((model) => !used.has(model.id)) ?? models[0];

        return {
          ...scenario,
          usage: [
            ...scenario.usage,
            {
              modelId: next.id,
              inputTokens: INPUT_COUNTS[label].input,
              outputTokens: INPUT_COUNTS[label].output,
            },
          ],
        };
      }),
    );
  }

  function removeUsage(label: SimulationWorkload["label"], index: number) {
    setWorkloads((current) =>
      current.map((scenario) =>
        scenario.label !== label
          ? scenario
          : {
              ...scenario,
              usage: scenario.usage.filter((_, rowIndex) => rowIndex !== index),
            },
      ),
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-black/10 bg-surface dark:border-white/10">
      <div className="border-b border-black/10 p-5 dark:border-white/10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Plan simulator</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
              Read-only what-if over operator-entered light, normal and heavy
              workloads. It uses recorded costs and current sell prices; it
              cannot publish a plan or mutate an existing subscription snapshot.
            </p>
          </div>
          <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-[11px] text-cyan-100">
            Simulated — no writes
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1 text-xs text-muted">
            <span className="block">Price (USD)</span>
            <Input
              aria-label="Simulated plan price in US dollars"
              inputMode="decimal"
              value={priceUsd}
              onChange={(event) => setPriceUsd(event.target.value)}
            />
          </div>
          <div className="space-y-1 text-xs text-muted">
            <span className="block">Interval</span>
            <select
              aria-label="Simulated plan interval"
              className={selectClass}
              value={interval}
              onChange={(event) =>
                setInterval(event.target.value as PlanInterval)
              }
            >
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </select>
          </div>
          <div className="space-y-1 text-xs text-muted">
            <span className="block">Included weighted tokens</span>
            <Input
              aria-label="Simulated included weighted tokens"
              inputMode="numeric"
              value={allowance}
              onChange={(event) => setAllowance(event.target.value)}
            />
          </div>
          <div className="space-y-1 text-xs text-muted">
            <span className="block">Overage</span>
            <select
              aria-label="Simulated overage policy"
              className={selectClass}
              value={overageMode}
              onChange={(event) =>
                setOverageMode(event.target.value as PlanOverageMode)
              }
            >
              <option value="block">Block</option>
              <option value="credit">Charge credit</option>
            </select>
          </div>
          <div className="space-y-1 text-xs text-muted">
            <span className="block">Overage markup (bps)</span>
            <Input
              aria-label="Simulated overage markup basis points"
              inputMode="numeric"
              value={markupBps}
              onChange={(event) => setMarkupBps(event.target.value)}
            />
          </div>
        </div>
      </div>

      {models.length === 0 ? (
        <p className="p-5 text-sm text-muted">
          No active catalog model has a sell price. Sync a provider before
          simulating a plan.
        </p>
      ) : (
        <div className="grid gap-4 p-5 xl:grid-cols-3">
          {simulation.scenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.label}
              models={models}
              scenario={scenario}
              workload={
                workloads.find((entry) => entry.label === scenario.label) ?? {
                  label: scenario.label,
                  usage: [],
                }
              }
              onAdd={() => addUsage(scenario.label)}
              onRemove={(index) => removeUsage(scenario.label, index)}
              onUpdate={(index, patch) =>
                updateUsage(scenario.label, index, patch)
              }
            />
          ))}
        </div>
      )}

      <p className="border-t border-black/10 px-5 py-3 text-[11px] leading-5 text-muted dark:border-white/10">
        Overage revenue is allocated across the entered model mix in proportion
        to weighted usage. That is a simulation assumption, not a replay of the
        gateway&apos;s per-call admission decision. Unknown or stale costs are
        flagged and are not presented as reliable contribution.
      </p>
    </section>
  );
}
