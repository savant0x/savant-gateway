"use client";

import type { AdminModelSummary } from "@/lib/types";

import { Button, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { responseError } from "@/components/dashboard/format";

export function ModelCostEditor({ model }: { model: AdminModelSummary }) {
  const router = useRouter();
  const [input, setInput] = useState(String(model.costInputPer1M));
  const [output, setOutput] = useState(String(model.costOutputPer1M));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: model.id,
          costInputPer1M: Number(input),
          costOutputPer1M: Number(output),
        }),
      });

      if (response.status === 401) {
        router.replace("/admin/login");

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

  return (
    <div className="min-w-[13rem] space-y-1">
      <div className="flex items-center gap-1">
        <input
          aria-label={`${model.name} input cost per 1M`}
          className="w-20 rounded-lg border border-white/10 bg-surface px-2 py-1 text-xs"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <input
          aria-label={`${model.name} output cost per 1M`}
          className="w-20 rounded-lg border border-white/10 bg-surface px-2 py-1 text-xs"
          value={output}
          onChange={(event) => setOutput(event.target.value)}
        />
        <Button isDisabled={busy} size="sm" variant="secondary" onPress={save}>
          {busy ? <Spinner size="sm" /> : "Save"}
        </Button>
      </div>
      <p className="text-[11px] text-muted">
        {model.costSource === "unknown"
          ? "Cost unknown — set before enabling"
          : model.costSource}
        {model.access === "free" ? " · sell stays zero in a free group" : ""}
      </p>
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}
