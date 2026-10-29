"use client";

import type { ModelGroupSummary } from "@/lib/types";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { responseError } from "@/components/dashboard/format";

export function GroupSelect({
  modelId,
  groupSlug,
  groups,
  disabled,
}: {
  modelId: string;
  groupSlug: string;
  groups: ModelGroupSummary[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: string) {
    if (next === groupSlug) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: modelId, groupSlug: next }),
      });

      if (response.status === 401) {
        router.replace("/admin/login");

        return;
      }

      if (!response.ok) throw new Error(await responseError(response));

      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not move the model.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-[9rem] space-y-1">
      <select
        aria-label={`Group for ${modelId}`}
        className="h-8 w-full rounded-lg border border-black/10 bg-background px-2 text-xs text-foreground outline-none focus:border-accent disabled:opacity-60 dark:border-white/10"
        disabled={disabled || busy}
        value={groupSlug}
        onChange={(event) => void change(event.target.value)}
      >
        {groups.map((group) => (
          <option key={group.slug} value={group.slug}>
            {group.label}
          </option>
        ))}
      </select>
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}
