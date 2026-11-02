"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = {
  ok: boolean;
  itemsSeen: number;
  itemsUpserted: number;
  error?: string;
};

export function ContentSourceActions({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function request(action: "fetch" | "toggle" | "delete") {
    if (
      action === "delete" &&
      !window.confirm("Delete this source and its items?")
    ) {
      return;
    }

    setBusy(action);
    setMessage(null);

    try {
      if (action === "fetch") {
        const response = await fetch("/api/admin/content/fetch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sourceId: id }),
        });
        const body = (await response.json()) as {
          error?: string;
          results?: Result[];
        };

        if (!response.ok) throw new Error(body.error ?? "Fetch failed.");

        const result = body.results?.[0];

        setMessage(
          result?.ok
            ? `${result.itemsUpserted} of ${result.itemsSeen} items stored.`
            : (result?.error ?? "Fetch failed."),
        );
      } else {
        const response = await fetch(
          action === "delete"
            ? `/api/admin/content/sources/${id}`
            : `/api/admin/content/sources/${id}`,
          {
            method: action === "delete" ? "DELETE" : "PATCH",
            headers: { "content-type": "application/json" },
            body:
              action === "delete"
                ? undefined
                : JSON.stringify({ enabled: !enabled }),
          },
        );
        const body = (await response.json()) as { error?: string };

        if (!response.ok) throw new Error(body.error ?? "Update failed.");

        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        className="rounded-md border border-black/10 px-2 py-1 text-xs transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
        disabled={busy !== null}
        type="button"
        onClick={() => request("fetch")}
      >
        {busy === "fetch" ? "Fetching…" : "Fetch"}
      </button>
      <button
        className="rounded-md border border-black/10 px-2 py-1 text-xs transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
        disabled={busy !== null}
        type="button"
        onClick={() => request("toggle")}
      >
        {enabled ? "Disable" : "Enable"}
      </button>
      <button
        className="rounded-md border border-danger/30 px-2 py-1 text-xs text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
        disabled={busy !== null}
        type="button"
        onClick={() => request("delete")}
      >
        Delete
      </button>
      {message ? (
        <span className="basis-full text-[11px] text-muted">{message}</span>
      ) : null}
    </div>
  );
}
