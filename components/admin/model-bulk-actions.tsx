"use client";

import type { ModelStatusSkipReason } from "@/lib/storage/store/models";

import { Button, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { responseError } from "@/components/dashboard/format";

/**
 * The bulk switch for a provider's selection.
 *
 * It exists because switching 281 rows one press at a time is not a workflow.
 * What it deliberately does *not* do is relax the rules: the request carries
 * ids, the store applies the same guard the single button applies, and every row
 * it could not switch is named with the reason. A bulk action that silently
 * skipped rows would leave the operator believing a provider is off when half of
 * it is on (FID-2026-1123-003).
 */

const REASON_WORDS: Record<ModelStatusSkipReason, string> = {
  not_found: "no longer exist",
  delisted: "are delisted upstream",
  not_eligible: "need a chat decision in the provider review",
  cost_unknown: "need an upstream cost and a sell price",
};

function skipNote(
  skipped: Array<{ id: string; reason: ModelStatusSkipReason }>,
) {
  if (skipped.length === 0) return "";

  const counts = new Map<ModelStatusSkipReason, number>();

  for (const row of skipped) {
    counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
  }

  const parts = Array.from(counts.entries()).map(
    ([reason, count]) => `${count} ${REASON_WORDS[reason]}`,
  );

  return ` Left unchanged: ${parts.join("; ")}.`;
}

export function ModelBulkActions({
  selected,
  matching,
  onSelectMatching,
  onClear,
}: {
  selected: string[];
  matching: number;
  onSelectMatching: () => void;
  onClear: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"active" | "disabled" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function apply(status: "active" | "disabled") {
    const verb = status === "active" ? "Enable" : "Disable";

    if (
      !window.confirm(
        `${verb} ${selected.length} selected model${selected.length === 1 ? "" : "s"}?` +
          (status === "active"
            ? " Rows that need a chat decision or a cost stay disabled and are reported."
            : ""),
      )
    ) {
      return;
    }

    setBusy(status);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected, status }),
      });

      if (!response.ok) throw new Error(await responseError(response));

      const payload = (await response.json().catch(() => null)) as {
        written?: number;
        skipped?: Array<{ id: string; reason: ModelStatusSkipReason }>;
      } | null;
      const skipped = payload?.skipped ?? [];

      setNotice(
        `${verb}d ${payload?.written ?? 0} of ${selected.length}.${skipNote(skipped)}`,
      );
      onClear();
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The switch did not apply.",
      );
    } finally {
      setBusy(null);
    }
  }

  const count = selected.length;
  const allMatching = matching > 0 && count === matching;

  return (
    <div className="space-y-2 rounded-xl border border-black/10 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">
          {count === 0
            ? `${matching} model${matching === 1 ? "" : "s"} match this filter. Select rows to switch them together.`
            : `${count} selected of ${matching} matching.`}
        </span>
        {count === 0 ? (
          <Button
            isDisabled={matching === 0}
            size="sm"
            variant="secondary"
            onPress={onSelectMatching}
          >
            Select all {matching}
          </Button>
        ) : (
          <>
            {allMatching ? null : (
              <Button size="sm" variant="secondary" onPress={onSelectMatching}>
                Select all {matching}
              </Button>
            )}
            <Button
              isDisabled={busy !== null}
              size="sm"
              variant="primary"
              onPress={() => apply("active")}
            >
              {busy === "active" ? <Spinner size="sm" /> : null}
              Enable selected
            </Button>
            <Button
              isDisabled={busy !== null}
              size="sm"
              variant="danger-soft"
              onPress={() => apply("disabled")}
            >
              {busy === "disabled" ? <Spinner size="sm" /> : null}
              Disable selected
            </Button>
            <Button
              isDisabled={busy !== null}
              size="sm"
              variant="secondary"
              onPress={onClear}
            >
              Clear
            </Button>
          </>
        )}
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {notice ? <p className="text-xs text-success">{notice}</p> : null}
    </div>
  );
}
