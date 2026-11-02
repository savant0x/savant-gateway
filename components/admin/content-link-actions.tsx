"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ContentLinkActions({
  itemId,
  modelId,
  relationSource,
}: {
  itemId: string;
  modelId: string;
  relationSource: "auto" | "operator";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function dismiss() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/content/links", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, modelId }),
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) throw new Error(body.error ?? "Dismiss failed.");

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  if (relationSource === "operator") {
    return <span className="text-[11px] text-muted">Operator</span>;
  }

  return (
    <button
      className="text-[11px] text-danger underline-offset-2 hover:underline disabled:opacity-50"
      disabled={busy}
      title={error ?? "Dismiss this automatic link"}
      type="button"
      onClick={dismiss}
    >
      {busy ? "Dismissing…" : "Dismiss"}
    </button>
  );
}
