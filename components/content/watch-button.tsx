"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function WatchButton({
  modelId,
  signedIn,
  watching,
}: {
  modelId: string;
  signedIn: boolean;
  watching: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(watching);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Link
        className="rounded-lg border border-black/10 px-3 py-2 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
        href="/login"
      >
        Sign in to follow
      </Link>
    );
  }

  async function toggle() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/account/content/watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelId, watched: !active }),
      });
      const body = (await response.json()) as {
        error?: string;
        watched?: boolean;
      };

      if (!response.ok)
        throw new Error(body.error ?? "Could not update follow.");

      setActive(body.watched === true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        aria-pressed={active}
        className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
          active
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
        }`}
        disabled={busy}
        type="button"
        onClick={toggle}
      >
        {busy ? "Saving…" : active ? "Following" : "Follow model"}
      </button>
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </div>
  );
}
