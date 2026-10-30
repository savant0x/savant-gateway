"use client";

import type { ModelSummary } from "@/lib/types";

import { useRouter } from "next/navigation";

type PickableModel = Pick<ModelSummary, "id" | "name" | "family">;

function Select({
  label,
  value,
  otherValue,
  models,
  families,
  onChange,
}: {
  label: string;
  value: string;
  otherValue: string;
  models: PickableModel[];
  families: string[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <select
        className="h-11 w-full min-w-0 rounded-xl border border-black/10 bg-background px-3 text-sm outline-none transition-colors focus:border-accent dark:border-white/10"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {families.map((family) => (
          <optgroup key={family} label={family}>
            {models
              .filter((model) => model.family === family)
              .map((model) => (
                <option
                  key={model.id}
                  disabled={model.id === otherValue}
                  value={model.id}
                >
                  {model.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/**
 * The pair lives in the URL, so a comparison is linkable and refreshes to the
 * same two models. Selecting a model replaces the entry rather than pushing one,
 * or swapping twice would fill the back button with every intermediate pair.
 */
export function ModelPicker({
  leftId,
  rightId,
  models,
}: {
  leftId: string;
  rightId: string;
  models: PickableModel[];
}) {
  const router = useRouter();
  const families = Array.from(
    new Set(models.map((model) => model.family)),
  ).sort();

  function go(nextLeft: string, nextRight: string) {
    const params = new URLSearchParams({ a: nextLeft, b: nextRight });

    router.replace(`/compare?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="mt-7 flex flex-col gap-3 rounded-xl border border-white/10 canvas-surface p-4 sm:flex-row sm:items-end">
      <Select
        families={families}
        label="Model A"
        models={models}
        otherValue={rightId}
        value={leftId}
        onChange={(id) => go(id, rightId)}
      />
      <button
        aria-label="Swap the two models"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted transition-colors hover:border-accent/50 hover:text-foreground"
        type="button"
        onClick={() => go(rightId, leftId)}
      >
        <i aria-hidden className="fa-solid fa-arrow-right-arrow-left" />
        Swap
      </button>
      <Select
        families={families}
        label="Model B"
        models={models}
        otherValue={leftId}
        value={rightId}
        onChange={(id) => go(leftId, id)}
      />
    </div>
  );
}
