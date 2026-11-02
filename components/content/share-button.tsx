"use client";

import { useState } from "react";

/** Native share where available; otherwise copy the current URL. */
export function ShareButton({ title }: { title: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function share() {
    const url = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({ title, url });

        return;
      }

      await navigator.clipboard.writeText(url);
      setMessage("Link copied");
    } catch (error) {
      setMessage(
        error instanceof Error && error.name === "AbortError"
          ? null
          : "Could not copy the link",
      );
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:text-foreground dark:border-white/10"
        type="button"
        onClick={share}
      >
        Share
      </button>
      {message ? (
        <span aria-live="polite" className="text-[11px] text-muted">
          {message}
        </span>
      ) : null}
    </div>
  );
}
