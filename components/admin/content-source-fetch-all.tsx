"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  enabledFetchTargets,
  readFetchResult,
  runFetchAll,
  summarizeFetchAll,
  type FetchAllSource,
} from "@/lib/content/fetch-all";

export function ContentSourceFetchAll({
  sources,
}: {
  sources: FetchAllSource[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function fetchAll() {
    const targets = enabledFetchTargets(sources);

    if (targets.length === 0) {
      setFailed(false);
      setMessage("No enabled sources to fetch.");

      return;
    }

    setBusy(true);
    setMessage(null);
    setFailed(false);

    try {
      const results = await runFetchAll(
        targets,
        async (id) => {
          const response = await fetch("/api/admin/content/fetch", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sourceId: id }),
          });

          return readFetchResult(response);
        },
        (target, current, total) => {
          setMessage(`Fetching ${current} of ${total}: ${target.label}…`);
        },
      );
      const summary = summarizeFetchAll(results);

      if (summary.failed > 0 && summary.firstFailure) {
        setFailed(true);
        setMessage(
          `Fetched ${summary.sources} source(s), ${summary.itemsStored} item(s) stored; ${summary.failed} failed. First failure: ${summary.firstFailure.sourceLabel} — ${summary.firstFailure.error ?? "unknown error"}`,
        );
      } else {
        setMessage(
          `Fetched ${summary.sources} source(s), ${summary.itemsStored} item(s) stored.`,
        );
      }

      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-black/15 px-4 py-3 dark:border-white/15">
      <div>
        <p className="text-sm font-semibold">Refresh every source</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          Fetches all enabled sources one at a time, regardless of their
          interval. Disabled sources are skipped; each source records its own
          cycle.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={busy}
          type="button"
          onClick={fetchAll}
        >
          {busy ? "Fetching all…" : "Fetch all sources"}
        </button>
        {message ? (
          <span
            aria-live="polite"
            className={`basis-full text-[11px] sm:basis-auto ${
              failed ? "text-danger" : "text-muted"
            }`}
          >
            {message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
