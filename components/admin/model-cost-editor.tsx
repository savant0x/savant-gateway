"use client";

import type { AdminModelSummary } from "@/lib/types";

import { Button, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PricingInputs } from "@/components/admin/pricing-inputs";
import { formatPricePer1M, responseError } from "@/components/dashboard/format";
import { adminLoginHref } from "@/lib/admin-return";
import { readPriceInput } from "@/lib/pricing";

function initial(value: number) {
  return String(Number(value.toFixed(6)));
}

export function ModelCostEditor({ model }: { model: AdminModelSummary }) {
  const router = useRouter();
  const [input, setInput] = useState(initial(model.ownCostInputPer1M));
  const [output, setOutput] = useState(initial(model.ownCostOutputPer1M));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedInput = input.trim() === "" ? Number.NaN : Number(input);
  const parsedOutput = output.trim() === "" ? Number.NaN : Number(output);
  const inputMicros = readPriceInput(parsedInput);
  const outputMicros = readPriceInput(parsedOutput);
  const invalid = inputMicros === null || outputMicros === null;
  const dirty =
    parsedInput !== model.ownCostInputPer1M ||
    parsedOutput !== model.ownCostOutputPer1M;

  async function save() {
    if (invalid) {
      setError("Both costs must be non-negative numbers in USD per 1M tokens.");

      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: model.id,
          costInputPer1M: parsedInput,
          costOutputPer1M: parsedOutput,
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

      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save the cost.",
      );
    } finally {
      setBusy(false);
    }
  }

  // The published row may be served by another provider. Its cost is the one
  // the gateway records, so editing this row's own cost would change nothing
  // about what a call pays.
  if (
    model.servedProviderSlug &&
    model.servedProviderSlug !== model.upstreamSlug
  ) {
    return (
      <div className="min-w-[13rem] space-y-1">
        <p className="mono text-xs tabular-nums">
          {formatPricePer1M(model.costInputPer1M)} /{" "}
          {formatPricePer1M(model.costOutputPer1M)}
        </p>
        <p className="text-[11px] text-muted">
          Served by {model.servedProviderSlug}; edit that provider&apos;s row.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-[15rem] space-y-1.5">
      <PricingInputs
        compact
        help="What the provider charges this gateway. Editing marks the cost manual; auto sell prices follow the default markup."
        idPrefix={`cost-${model.id}`}
        input={input}
        inputInvalid={inputMicros === null}
        legend="Upstream cost"
        output={output}
        outputInvalid={outputMicros === null}
        onInput={setInput}
        onOutput={setOutput}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted">
          {model.costSource === "unknown"
            ? "Cost unknown — set before enabling"
            : model.costSource}
          {model.costObservedAt
            ? ` · observed ${new Date(model.costObservedAt).toISOString().slice(0, 10)}`
            : ""}
        </p>
        <Button
          isDisabled={busy || invalid || !dirty}
          size="sm"
          variant="secondary"
          onPress={save}
        >
          {busy ? <Spinner size="sm" /> : "Save cost"}
        </Button>
      </div>
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}
