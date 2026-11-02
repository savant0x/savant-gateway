"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SaveButton({
  itemId,
  signedIn,
  saved,
}: {
  itemId: string;
  signedIn: boolean;
  saved: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Link
        className="text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
        href="/login"
      >
        Sign in to save
      </Link>
    );
  }

  async function toggle() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/account/content/saved", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, saved: !active }),
      });
      const body = (await response.json()) as {
        error?: string;
        saved?: boolean;
      };

      if (!response.ok)
        throw new Error(body.error ?? "Could not update saved items.");

      setActive(body.saved === true);
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
        className={`text-xs font-medium underline-offset-4 hover:underline disabled:opacity-50 ${
          active ? "text-accent" : "text-muted"
        }`}
        disabled={busy}
        type="button"
        onClick={toggle}
      >
        {busy ? "Saving…" : active ? "Saved" : "Save for later"}
      </button>
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </div>
  );
}
