"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CONTENT_LIMITS } from "@/lib/content/policy";

export function CommentForm({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limit = CONTENT_LIMITS.commentMaxChars;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = text.trim();

    if (!body || busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/content/${encodeURIComponent(itemId)}/comments`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save that comment.");
      }

      setText("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save that comment.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-4" onSubmit={submit}>
      <label className="sr-only" htmlFor={`comment-${itemId}`}>
        Add a comment
      </label>
      <textarea
        className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm leading-6 outline-none focus:border-accent/60 dark:border-white/10"
        id={`comment-${itemId}`}
        maxLength={limit}
        placeholder="Add to the discussion…"
        rows={3}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted">
          {text.length} / {limit}
        </span>
        <button
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
          disabled={busy || text.trim().length === 0}
          type="submit"
        >
          {busy ? "Posting…" : "Post comment"}
        </button>
      </div>
      {error ? <p className="mt-2 text-[11px] text-danger">{error}</p> : null}
    </form>
  );
}
