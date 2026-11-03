"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteCommentButton({
  itemId,
  commentId,
}: {
  itemId: string;
  commentId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    if (
      !window.confirm(
        "Delete this comment? Any replies to it are deleted as well.",
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/content/${encodeURIComponent(itemId)}/comments?commentId=${encodeURIComponent(commentId)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };

        throw new Error(payload.error ?? "Could not delete that comment.");
      }

      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not delete that comment.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="text-[11px] text-muted underline-offset-4 hover:text-danger hover:underline disabled:opacity-50"
        disabled={busy}
        type="button"
        onClick={remove}
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </span>
  );
}
