"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SeedResult = { created: string[]; skipped: string[] };

export function ContentSourcePresets() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function seed() {
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/content/sources/seed", {
        method: "POST",
      });
      const body = (await response.json()) as SeedResult & { error?: string };

      if (!response.ok) throw new Error(body.error ?? "Seeding failed.");

      setMessage(
        body.created.length === 0
          ? "All recommended sources are already registered."
          : `${body.created.length} source(s) added. Fetch them to populate Signal.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-black/15 px-4 py-3 dark:border-white/15">
      <div>
        <p className="text-sm font-semibold">Start from the old source list</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          Adds the committed aggroNATION rows, the inferred canonical feeds, the
          YouTube handles recovered from the old local volume, and the
          AI-filtered Hacker News stream. Existing URLs are never modified.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={busy}
          type="button"
          onClick={seed}
        >
          {busy ? "Adding…" : "Add recommended sources"}
        </button>
        {message ? (
          <span className="basis-full text-[11px] text-muted sm:basis-auto">
            {message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
