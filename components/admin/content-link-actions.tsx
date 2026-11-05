"use client";

import type { ContentLinkState } from "@/lib/content/types";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Action = "accept" | "dismiss" | "restore";

const LABELS: Record<Action, string> = {
  accept: "Accept",
  dismiss: "Dismiss",
  restore: "Restore",
};

const STATE_CLASS: Record<ContentLinkState, string> = {
  suggested: "text-warning",
  auto_published: "text-success",
  accepted: "text-success",
  dismissed: "text-danger",
  retired: "text-muted",
};

export function ContentLinkActions({
  itemId,
  modelId,
  state,
  revision,
}: {
  itemId: string;
  modelId: string;
  state: ContentLinkState;
  revision: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: Action) {
    setBusy(action);
    setError(null);

    try {
      const response = await fetch("/api/admin/content/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId,
          modelId,
          action,
          expectedRevision: revision,
        }),
      });
      const body = (await response.json()) as { error?: string };

      if (response.status === 409) {
        throw new Error("This link changed. Refresh and decide again.");
      }

      if (!response.ok) throw new Error(body.error ?? "Decision failed.");

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  }

  const actions: Action[] = [];

  if (state === "suggested" || state === "auto_published") {
    actions.push("accept");
  }

  if (
    state === "suggested" ||
    state === "auto_published" ||
    state === "accepted"
  ) {
    actions.push("dismiss");
  }

  if (state === "dismissed") actions.push("restore");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`text-[11px] font-medium ${STATE_CLASS[state]}`}
        title={error ?? `Revision ${revision}`}
      >
        {state}
      </span>
      {actions.map((action) => (
        <button
          key={action}
          className="text-[11px] text-accent underline-offset-2 hover:underline disabled:opacity-50"
          disabled={busy !== null}
          title={error ?? `${LABELS[action]} this link`}
          type="button"
          onClick={() => act(action)}
        >
          {busy === action ? "Saving…" : LABELS[action]}
        </button>
      ))}
      {error ? (
        <span className="basis-full text-[11px] text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
